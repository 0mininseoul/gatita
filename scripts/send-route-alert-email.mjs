#!/usr/bin/env node

// 기능 안내 메일 일회성 발송.
//   node scripts/send-route-alert-email.mjs --dry-run
//   node scripts/send-route-alert-email.mjs
//
// Idempotency-Key 로 재실행 시 중복 발송이 차단된다.

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import ts from 'typescript'

const DRY_RUN = process.argv.includes('--dry-run')
const ADMIN_USER_ID = '5a018580-6558-44fc-a621-1fa2506e9d5e'
const SAMPLE_SIZE = 3

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
// 테스트와 실제 발송이 같은 소스(같은 문구)를 공유하게 한다.
function loadCreateRouteAlertEmail() {
  const source = fs.readFileSync(path.join(process.cwd(), 'lib/route-alert-email.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })

  const requiredModule = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(() => ({}), requiredModule, requiredModule.exports)
  return requiredModule.exports.createRouteAlertEmail
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

async function sendOne({ apiKey, from, replyTo, createRouteAlertEmail, recipient }) {
  const emailContent = createRouteAlertEmail(recipient.name ?? '')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `gatita-route-alerts/${recipient.user_id}`,
    },
    body: JSON.stringify({
      from,
      to: [recipient.email],
      reply_to: replyTo,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Resend 발송 실패: ${response.status} ${body}`)
  }
}

async function main() {
  const envFile = loadEnvFile(path.join(process.cwd(), '.env.local'))
  const supabase = createSupabaseAdmin(envFile)
  const recipients = await fetchRecipients(supabase)

  if (DRY_RUN) {
    console.log(`대상자 수: ${recipients.length}명`)
    console.log('이메일 샘플:')
    for (const recipient of recipients.slice(0, SAMPLE_SIZE)) {
      console.log(`  - ${recipient.email}`)
    }
    return
  }

  const apiKey = getEnv(envFile, 'RESEND_API_KEY')
  const from = getEnv(envFile, 'RESEND_FROM_EMAIL')
  const replyTo = getEnv(envFile, 'RESEND_REPLY_TO')

  if (!apiKey || !from || !replyTo) {
    throw new Error('Missing RESEND_API_KEY, RESEND_FROM_EMAIL, or RESEND_REPLY_TO.')
  }

  // createRouteAlertEmail 은 본문의 수신거부 회신 주소를 process.env.RESEND_REPLY_TO
  // 에서 읽는다. .env.local 값은 이 스크립트가 직접 파싱한 envFile에만 있으므로,
  // 실제 발신 설정(replyTo)과 메일 본문 문구를 일치시키기 위해 반영해둔다.
  process.env.RESEND_REPLY_TO = replyTo

  const createRouteAlertEmail = loadCreateRouteAlertEmail()

  let successCount = 0
  let failureCount = 0

  // 동시성 없이 한 명씩 순차 발송한다. 84명 규모라 rate limit 걱정은 없고,
  // 개별 실패가 나머지 발송을 막지 않도록 각자 try/catch로 감싼다.
  for (const recipient of recipients) {
    try {
      await sendOne({ apiKey, from, replyTo, createRouteAlertEmail, recipient })
      successCount += 1
      console.log(`발송 성공: ${recipient.email}`)
    } catch (error) {
      failureCount += 1
      console.error(`발송 실패: ${recipient.email} - ${error instanceof Error ? error.message : error}`)
    }
  }

  console.log(`완료: 총 ${recipients.length}건 중 성공 ${successCount}건, 실패 ${failureCount}건`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
