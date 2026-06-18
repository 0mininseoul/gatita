import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = process.cwd()
const readProjectFile = (...parts) => readFileSync(join(root, ...parts), 'utf8')

test('profile onboarding verifies phone with Supabase SMS MFA and stores payout account separately', () => {
  const signup = readProjectFile('components', 'auth', 'SignupForm.tsx')
  const schema = readProjectFile('supabase_schema.sql')
  const types = readProjectFile('lib', 'supabase.ts')

  assert.match(signup, /factorType:\s*['"]phone['"]/, 'signup should enroll a phone MFA factor')
  assert.match(signup, /auth\.mfa\.challenge/, 'signup should send an SMS challenge')
  assert.match(signup, /auth\.mfa\.verify/, 'signup should verify the SMS code')
  assert.match(signup, /phone_verified_at/, 'signup should persist phone verification metadata')
  assert.match(signup, /user_payout_accounts/, 'signup should store bank details outside users table')
  assert.match(signup, /bank_name/, 'signup should collect bank name')
  assert.match(signup, /account_number/, 'signup should collect account number')
  assert.match(signup, /account_holder/, 'signup should collect account holder')

  assert.match(schema, /create table public\.user_payout_accounts/i, 'schema should define payout account table')
  assert.match(schema, /Room participants can read creator payout accounts/i, 'schema should scope payout account reads to room participants')
  assert.match(types, /export type PayoutAccount/, 'Supabase types should expose payout accounts')
})

test('settings lets users edit payout account while keeping phone immutable', () => {
  const settings = readProjectFile('app', 'settings', 'page.tsx')

  assert.match(settings, /user_payout_accounts/, 'settings should read and update payout accounts')
  assert.match(settings, /bank_name/, 'settings should render bank name input')
  assert.match(settings, /account_number/, 'settings should render account number input')
  assert.match(settings, /account_holder/, 'settings should render account holder input')
  assert.match(settings, /disabled[\s\S]*value=\{(?:user|profile)\.phone\}|value=\{(?:user|profile)\.phone\}[\s\S]*disabled/, 'phone number should remain immutable in settings')
})
