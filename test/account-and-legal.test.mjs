import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const DELETE_CONFIRMATION_TEXT = '떠나지 말아주세요. 탈퇴하시는 이유를 여쭤봐도 될까요? 열심히 만들었어요 흑흑'

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test('settings exposes a low-emphasis but deliberate account deletion flow', () => {
  const source = readProjectFile('app/settings/page.tsx')

  assert.match(source, /deleteStep/)
  assert.match(source, /탈퇴하기/)
  assert.match(source, new RegExp(DELETE_CONFIRMATION_TEXT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(source, /fetch\('\/api\/account\/delete'/)
  assert.match(source, /deleteConfirmText\.trim\(\) === DELETE_CONFIRMATION_TEXT/)
})

test('settings contact card opens the user mail app without rendering the admin email', () => {
  const source = readProjectFile('app/settings/page.tsx')

  assert.match(source, /ADMIN_CONTACT_EMAIL/)
  assert.match(source, /createMailHref/)
  assert.match(source, /mailto:\$\{ADMIN_CONTACT_EMAIL\}/)
  assert.match(source, /문의하기/)
  assert.match(source, /버그 제보/)
  assert.doesNotMatch(source, /ym5373@gachon\.ac\.kr 로 메일 주세요/)
})

test('settings back action returns to the authenticated map', () => {
  const source = readProjectFile('app/settings/page.tsx')

  assert.match(source, /router\.push\('\/map'\)/)
  assert.doesNotMatch(source, /onClick=\{\(\) => router\.back\(\)\}/)
})

test('account deletion API verifies the session and deletes the auth user with the service role key', () => {
  const routePath = 'app/api/account/delete/route.ts'

  assert.equal(existsSync(join(process.cwd(), routePath)), true)

  const source = readProjectFile(routePath)
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(source, /confirmation !== DELETE_CONFIRMATION_TEXT/)
  assert.match(source, new RegExp(DELETE_CONFIRMATION_TEXT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(source, /auth\.getUser\(\)/)
  assert.match(source, /auth\.admin\.deleteUser\(user\.id\)/)
})

test('public legal and metadata copy do not expose the owner real name', () => {
  const files = [
    'app/privacy/page.tsx',
    'app/terms/page.tsx',
    'app/layout.tsx',
  ]

  files.forEach((file) => {
    assert.doesNotMatch(readProjectFile(file), /박영민/, `${file} should not expose a real name`)
  })
})

test('legal pages use a compact system-font document layout', () => {
  const shellSource = readProjectFile('components/legal/LegalShell.tsx')
  const cssSource = readProjectFile('app/globals.css')

  assert.match(shellSource, /className="legal-shell/)
  assert.match(shellSource, /ArrowLeft/)
  assert.match(shellSource, /\/brand\/gatita-logo\.png/)
  assert.doesNotMatch(shellSource, />개인정보처리방침<[\s\S]*>서비스약관</)
  assert.match(cssSource, /\.legal-shell\s*\{/)
  assert.match(cssSource, /font-family:\s*-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;/)
  assert.match(cssSource, /font-size:\s*0\.8125rem;/)
})

test('landing headline shadow is tighter and more natural', () => {
  const source = readProjectFile('app/page.tsx')

  assert.doesNotMatch(source, /0 2px 28px rgba\(28, 22, 92, 0\.45\)/)
  assert.match(source, /0 3px 14px rgba\(21, 28, 72, 0\.30\)/)
})
