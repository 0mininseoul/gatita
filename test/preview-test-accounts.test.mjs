import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test('preview account catalog defines exactly three Gachon test users without passwords', () => {
  const catalogPath = 'lib/previewTestAccounts.json'
  assert.equal(existsSync(join(process.cwd(), catalogPath)), true)

  const accounts = JSON.parse(readProjectFile(catalogPath))
  assert.equal(accounts.length, 3)

  const keys = accounts.map((account) => account.key)
  const emails = accounts.map((account) => account.email)

  assert.deepEqual(keys, ['preview-1', 'preview-2', 'preview-3'])
  assert.deepEqual(accounts.map((account) => account.nickname), ['세연', '수정', '유진'])
  assert.equal(new Set(emails).size, 3)
  emails.forEach((email) => assert.match(email, /@gachon\.ac\.kr$/))
  accounts.forEach((account) => {
    assert.ok(account.name)
    assert.ok(account.nickname)
    assert.ok(account.department)
    assert.equal('password' in account, false)
  })
})

test('preview login API is server-gated and never exposes the service role key', () => {
  const routePath = 'app/api/auth/preview-login/route.ts'
  assert.equal(existsSync(join(process.cwd(), routePath)), true)

  const route = readProjectFile(routePath)
  assert.match(route, /ENABLE_PREVIEW_TEST_LOGIN/)
  assert.match(route, /PREVIEW_TEST_ACCOUNT_PASSWORD/)
  assert.match(route, /getPreviewTestAccount/)
  assert.match(route, /createClient/)
  assert.match(route, /signInWithPassword/)
  assert.doesNotMatch(route, /NEXT_PUBLIC_PREVIEW_TEST_ACCOUNT_PASSWORD/)
  assert.doesNotMatch(route, /createAdminSupabase/)
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY/)
})

test('landing page exposes preview account buttons only behind a public flag', () => {
  const page = readProjectFile('app/page.tsx')

  assert.match(page, /isPreviewTestLoginEnabled/)
  assert.match(page, /PREVIEW_TEST_ACCOUNTS/)
  assert.match(page, /handlePreviewTestLogin/)
  assert.match(page, /\/api\/auth\/preview-login/)
  assert.doesNotMatch(page, /PREVIEW_TEST_ACCOUNT_PASSWORD/)
  assert.doesNotMatch(page, /signInWithPassword/)
})

test('preview account seeding script creates confirmed auth users and completed profiles', () => {
  const scriptPath = 'scripts/preview-test-accounts.mjs'
  assert.equal(existsSync(join(process.cwd(), scriptPath)), true)

  const script = readProjectFile(scriptPath)
  assert.match(script, /auth\.admin\.createUser/)
  assert.match(script, /auth\.admin\.updateUserById/)
  assert.match(script, /email_confirm:\s*true/)
  assert.match(script, /PREVIEW_TEST_ACCOUNT_PASSWORD/)
  assert.match(script, /user_private_profiles/)
  assert.match(script, /onboarded_at/)
  assert.match(script, /bank_name/)
  assert.doesNotMatch(script, /NEXT_PUBLIC_PREVIEW_TEST_ACCOUNT_PASSWORD/)
})
