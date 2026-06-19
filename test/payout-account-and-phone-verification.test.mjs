import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = process.cwd()
const readProjectFile = (...parts) => readFileSync(join(root, ...parts), 'utf8')

test('profile onboarding stores phone without SMS MFA and derives department from Google profile', () => {
  const signup = readProjectFile('components', 'auth', 'SignupForm.tsx')
  const auth = readProjectFile('lib', 'auth.ts')
  const schema = readProjectFile('supabase_schema.sql')
  const types = readProjectFile('lib', 'supabase.ts')

  assert.doesNotMatch(signup, /auth\.mfa/, 'signup should not use Supabase SMS MFA')
  assert.doesNotMatch(signup, /인증번호/, 'signup should not render SMS code UI')
  assert.doesNotMatch(signup, /id:\s*['"]department['"]/, 'department should not be a manual onboarding step')
  assert.match(auth, /extractGachonProfileFromMetadata/, 'auth helpers should parse Google profile metadata')
  assert.match(signup, /extractGachonProfileFromMetadata/, 'signup should use parsed Google profile metadata')
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
  const signup = readProjectFile('components', 'auth', 'SignupForm.tsx')
  const bankFields = readProjectFile('components', 'BankAccountFields.tsx')
  const banks = readProjectFile('lib', 'banks.ts')

  assert.match(settings, /user_payout_accounts/, 'settings should read and update payout accounts')
  assert.match(settings, /BankSelectField/, 'settings should render bank dropdown')
  assert.match(settings, /AccountNumberSegmentField/, 'settings should render segmented account number boxes')
  assert.match(signup, /BankSelectField/, 'signup should use the same bank dropdown')
  assert.match(signup, /AccountNumberSegmentField/, 'signup should use segmented account number boxes')
  assert.match(signup, /방장으로 참여하면 계좌번호가 같은 방 멤버에게 노출될 수 있습니다\./, 'signup should explicitly warn that account number can be exposed to room members')
  assert.match(bankFields, /BANK_OPTIONS/, 'bank fields should be driven by shared bank metadata')
  assert.match(bankFields, /logoSrc/, 'bank dropdown should render real bank logo images when available')
  assert.match(bankFields, /직접 입력/, 'bank dropdown should allow manual bank name entry')
  assert.match(bankFields, /onCustomBankChange/, 'manual bank entry should feed the same bank name value')
  assert.doesNotMatch(bankFields, /형식:/, 'account number helper text should not show format copy under the inputs')
  assert.match(banks, /name:\s*'카카오뱅크'[\s\S]*segments:\s*\[4,\s*2,\s*7\]/, 'KakaoBank should use XXXX-XX-XXXXXXX')
  assert.match(banks, /logoSrc:\s*['"]https:\/\//, 'bank metadata should include remote logo sources')
  assert.match(settings, /account_holder/, 'settings should render account holder input')
  assert.match(settings, /disabled[\s\S]*value=\{(?:user|profile)\.phone\}|value=\{(?:user|profile)\.phone\}[\s\S]*disabled/, 'phone number should remain immutable in settings')
})

test('profile onboarding uses three phone boxes and keeps account number segmentation stable', () => {
  const signup = readProjectFile('components', 'auth', 'SignupForm.tsx')
  const settings = readProjectFile('app', 'settings', 'page.tsx')
  const bankFields = readProjectFile('components', 'BankAccountFields.tsx')

  assert.match(signup, /PhoneSegmentField/, 'signup should render the segmented phone component')
  assert.match(signup, /const segmentLengths = \[3, 4, 4\]/, 'phone number should use 010 / middle / last boxes')
  assert.match(signup, /grid-cols-\[0\.82fr_auto_1fr_auto_1fr\]/, 'phone boxes should be visually separated into three fields')
  assert.match(signup, /placeholder=\{index === 0 \? '010' : '0000'\}/, 'phone field should guide the expected values per segment')
  assert.match(signup, /joinPhoneSegments/, 'phone segments should be normalized into the existing 010-0000-0000 storage format')
  assert.match(bankFields, /inputRefs\.current = inputRefs\.current\.slice\(0, segments\.length\)/, 'account segment refs should be trimmed when bank format changes')
  assert.match(bankFields, /const pastedSegments = splitAccountNumberForBank\(bankName, digits\)/, 'pasted account numbers should be repartitioned by selected bank')
  assert.match(bankFields, /handleSegmentKeyDown/, 'account segment inputs should handle backward focus without crashing')
  assert.match(settings, /\.\.\.\(field === 'bank_name' \? \{ account_number: '' \} : \{\}\)/, 'changing bank should clear a stale account number format')
})
