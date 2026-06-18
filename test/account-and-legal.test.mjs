import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test('settings exposes a low-emphasis but deliberate account deletion flow', () => {
  const source = readProjectFile('app/settings/page.tsx')

  assert.match(source, /deleteStep/)
  assert.match(source, /탈퇴하기/)
  assert.match(source, /탈퇴합니다/)
  assert.match(source, /fetch\('\/api\/account\/delete'/)
  assert.match(source, /deleteConfirmText\.trim\(\) === '탈퇴합니다'/)
})

test('account deletion API verifies the session and deletes the auth user with the service role key', () => {
  const routePath = 'app/api/account/delete/route.ts'

  assert.equal(existsSync(join(process.cwd(), routePath)), true)

  const source = readProjectFile(routePath)
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(source, /confirmation !== '탈퇴합니다'/)
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
