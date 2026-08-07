#!/usr/bin/env node

// 기능 안내 메일 일회성 발송.
//   node scripts/send-route-alert-email.mjs --dry-run
//   node scripts/send-route-alert-email.mjs
//
// Idempotency-Key 로 재실행 시 중복 발송이 차단된다.
// --dry-run이 아닌 전체 발송은 되돌릴 수 없으므로, 대상자 수/샘플을 보여준 뒤
// 터미널에서 "send"를 직접 입력해야 진행된다(엔터 한 번으로 통과되지 않음).

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import ts from 'typescript'

const DRY_RUN = process.argv.includes('--dry-run')
const ADMIN_USER_ID = '5a018580-6558-44fc-a621-1fa2506e9d5e'
const SAMPLE_SIZE = 3
const CONFIRM_TOKEN = 'send'

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}

  const env = {}
  const content = fs.readFileSync(filePath, 'utf8')

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    env[key] = value
  }

  return env
}

function getEnv(envFile, key) {
  return process.env[key] || envFile[key] || ''
}

function createSupabaseAdmin(envFile) {
  const supabaseUrl = getEnv(envFile, 'NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = getEnv(envFile, 'SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// lib/route-alert-email.ts 는 TS라 .mjs 스크립트에서 바로 import 할 수 없다.
// test/route-alert-email.test.mjs 와 같은 transpileModule 방식으로 로드해서
// 테스트와 실제 발송이 같은 소스(같은 문구, 같은 Resend 호출 로직)를 공유하게 한다.
// sendRouteAlertEmail까지 여기서 그대로 가져와 쓴다 — 스크립트 안에 fetch 호출을
// 따로 복제하면 두 곳의 에러 메시지/헤더가 갈라질 수 있어서다(리뷰 지적 반영).
function loadRouteAlertEmailModule() {
  const source = fs.readFileSync(path.join(process.cwd(), 'lib/route-alert-email.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })

  const requiredModule = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(() => ({}), requiredModule, requiredModule.exports)
  return requiredModule.exports
}

async function fetchRecipients(supabase) {
  // 온보딩 미완료자(onboarded_at is null)도 대상에 포함한다 — 기능 안내가
  // 온보딩 복귀 유인이 될 수 있어서 일부러 필터링하지 않는다.
  // is_admin=false 에 더해 관리자 계정을 명시적으로도 제외해 이중 방어한다.
  const { data, error } = await supabase
    .from('user_private_profiles')
    .select('user_id, email, name')
    .eq('status', 'active')
    .eq('is_admin', false)
    .not('email', 'is', null)
    .neq('user_id', ADMIN_USER_ID)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

function printRecipientSummary(recipients) {
  console.log(`대상자 수: ${recipients.length}명`)
  console.log('이메일 샘플:')
  for (const recipient of recipients.slice(0, SAMPLE_SIZE)) {
    console.log(`  - ${recipient.email}`)
  }
}

// 입력값이 확인 토큰과 정확히 일치할 때만 true. 순수 함수라 실제
// readline/stdin 없이도 테스트로 호출 가능하다(test/route-alert-send-confirmation.test.mjs).
export function isSendConfirmed(answer) {
  return typeof answer === 'string' && answer.trim() === CONFIRM_TOKEN
}

// 되돌릴 수 없는 전체 발송 직전에 사람 확인을 받는다. 엔터 한 번으로 통과되면
// --dry-run을 빼먹거나 오타를 냈을 때 즉시 84명에게 발송되는 사고로 이어지므로,
// 특정 문자열을 직접 타이핑해야만 진행되게 한다.
async function confirmFullSend(recipients) {
  // stdin이 TTY가 아니면(파이프, CI 등) 사람이 확인할 방법이 없다 — 조용히
  // 발송되는 것을 막기 위해 진행 대신 에러로 중단한다.
  if (!process.stdin.isTTY) {
    throw new Error(
      '확인 프롬프트를 표시할 수 없는 환경입니다(stdin이 TTY가 아님). 대화형 터미널에서 직접 실행해주세요.',
    )
  }

  printRecipientSummary(recipients)

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  let answer
  try {
    answer = await rl.question(`계속하려면 "${CONFIRM_TOKEN}"를 입력하세요: `)
  } finally {
    rl.close()
  }

  return isSendConfirmed(answer)
}

async function main() {
  const envFile = loadEnvFile(path.join(process.cwd(), '.env.local'))
  const supabase = createSupabaseAdmin(envFile)
  const recipients = await fetchRecipients(supabase)

  if (DRY_RUN) {
    printRecipientSummary(recipients)
    return
  }

  const apiKey = getEnv(envFile, 'RESEND_API_KEY')
  const from = getEnv(envFile, 'RESEND_FROM_EMAIL')
  const replyTo = getEnv(envFile, 'RESEND_REPLY_TO')

  if (!apiKey || !from || !replyTo) {
    throw new Error('Missing RESEND_API_KEY, RESEND_FROM_EMAIL, or RESEND_REPLY_TO.')
  }

  // sendRouteAlertEmail(lib/route-alert-email.ts)은 이 세 값을 process.env에서
  // 직접 읽는다. .env.local 값은 이 스크립트가 별도로 파싱한 envFile에만 있으므로,
  // 실제 발신 설정과 메일 본문 문구(수신거부 회신 주소 등)를 일치시키기 위해 반영해둔다.
  process.env.RESEND_API_KEY = apiKey
  process.env.RESEND_FROM_EMAIL = from
  process.env.RESEND_REPLY_TO = replyTo

  const confirmed = await confirmFullSend(recipients)
  if (!confirmed) {
    console.log('입력이 일치하지 않아 발송을 취소했습니다. 아무것도 발송하지 않았습니다.')
    return
  }

  const { sendRouteAlertEmail } = loadRouteAlertEmailModule()

  let successCount = 0
  let failureCount = 0

  // 동시성 없이 한 명씩 순차 발송한다. 84명 규모라 rate limit 걱정은 없고,
  // 개별 실패가 나머지 발송을 막지 않도록 각자 try/catch로 감싼다.
  for (const recipient of recipients) {
    try {
      await sendRouteAlertEmail({ userId: recipient.user_id, email: recipient.email, name: recipient.name ?? '' })
      successCount += 1
      console.log(`발송 성공: ${recipient.email}`)
    } catch (error) {
      failureCount += 1
      console.error(`발송 실패: ${recipient.email} - ${error instanceof Error ? error.message : error}`)
    }
  }

  console.log(`완료: 총 ${recipients.length}건 중 성공 ${successCount}건, 실패 ${failureCount}건`)
}

// 테스트가 이 파일에서 isSendConfirmed 같은 순수 함수를 그냥 import 할 수 있도록,
// "직접 실행됐을 때만" main()을 돌린다(import만 했을 때는 발송/DB 접속이 절대 일어나지 않는다).
const isMainModule = process.argv[1] != null && fileURLToPath(import.meta.url) === process.argv[1]

if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
