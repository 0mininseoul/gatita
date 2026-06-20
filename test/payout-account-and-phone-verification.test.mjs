import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = process.cwd()
const readProjectFile = (...parts) => readFileSync(join(root, ...parts), 'utf8')

test('profile onboarding stores phone without SMS MFA and derives department from Google profile', () => {
  const signup = readProjectFile('components', 'auth', 'SignupForm.tsx')
  const auth = readProjectFile('lib', 'auth.ts')
  const completeRoute = readProjectFile('app', 'api', 'profile', 'complete', 'route.ts')
  const meRoute = readProjectFile('app', 'api', 'profile', 'me', 'route.ts')
  const schema = readProjectFile('supabase_schema.sql')
  const types = readProjectFile('lib', 'supabase.ts')

  assert.doesNotMatch(signup, /auth\.mfa/, 'signup should not use Supabase SMS MFA')
  assert.doesNotMatch(signup, /인증번호/, 'signup should not render SMS code UI')
  assert.doesNotMatch(signup, /id:\s*['"]department['"]/, 'department should not be a manual onboarding step')
  assert.match(auth, /extractGachonProfileFromMetadata/, 'auth helpers should parse Google profile metadata')
  assert.match(signup, /extractGachonProfileFromMetadata/, 'signup should use parsed Google profile metadata')
  assert.match(signup, /\/api\/profile\/complete/, 'signup should complete private profile through a server route')
  assert.match(completeRoute, /\.upsert\(/, 'profile completion should be idempotent for duplicate submits')
  assert.doesNotMatch(completeRoute, /\.delete\(\)\.eq\('id', authUser\.id\)/, 'duplicate profile completion must not delete a successfully created public user')
  assert.match(meRoute, /!publicProfile \|\| !privateProfile \|\| !payoutAccount/, 'profile should not be considered complete until payout account exists')
  assert.match(signup, /bank_name/, 'signup should collect bank name')
  assert.match(signup, /account_number/, 'signup should collect account number')
  assert.match(signup, /account_holder/, 'signup should collect account holder')
  assert.match(signup, /placeholder:\s*'가천존예여신'/, 'nickname placeholder should use the requested sample nickname')

  assert.match(schema, /create table public\.user_private_profiles/i, 'schema should split private identity fields out of users')
  assert.match(schema, /create table public\.user_payout_accounts/i, 'schema should define payout account table')
  assert.match(schema, /grant select \(id, nickname, nickname_updated_at, department, avatar_url, created_at, updated_at\)\s+on table public\.users to authenticated/i, 'public users table should expose only public profile columns')
  assert.match(schema, /Users can read own private profile/i, 'schema should allow users to read only their own private profile')
  assert.doesNotMatch(schema, /Room participants can read creator payout accounts/i, 'room participants must not read payout accounts directly through RLS')
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
  assert.match(signup, /동행 시 정산 받을 은행을 입력해주세요/, 'bank step should explain the payout context')
  assert.doesNotMatch(signup, /label:\s*'정산 받을 은행을 입력해주세요'/, 'bank step should not use the old shorter copy')
  assert.equal(
    (signup.match(/방을 개설하면 같은 방 참여자에게 공개될 수 있습니다/g) ?? []).length,
    3,
    'bank, account number, and account holder steps should share the same exposure description'
  )
  assert.doesNotMatch(signup, /방장이 되면 같은 방 참여자에게 공개됩니다/, 'signup should not use the older payout exposure copy')
  assert.doesNotMatch(signup, /방장으로 참여하면 계좌번호가 같은 방 멤버에게 노출될 수 있습니다\./, 'account number step should not duplicate the exposure warning below the field')
  assert.match(bankFields, /BANK_OPTIONS/, 'bank fields should be driven by shared bank metadata')
  assert.match(bankFields, /logoSrc/, 'bank dropdown should render real bank logo images when available')
  assert.match(bankFields, /직접 입력/, 'bank dropdown should allow manual bank name entry')
  assert.match(bankFields, /onCustomBankChange/, 'manual bank entry should feed the same bank name value')
  assert.doesNotMatch(bankFields, /형식:/, 'account number helper text should not show format copy under the inputs')
  assert.doesNotMatch(bankFields, /absolute left-0 right-0 top-full/, 'bank dropdown should stay in document flow so mobile pages can scroll around it')
  assert.match(bankFields, /data-bank-dropdown-list/, 'bank dropdown list should be explicitly identifiable for scroll-safe styling')
  assert.match(bankFields, /placeholder=\{'0'\.repeat\(length\)\}/, 'account segment placeholders should match each selected bank segment length')
  assert.match(banks, /name:\s*'카카오뱅크'[\s\S]*segments:\s*\[4,\s*2,\s*7\]/, 'KakaoBank should use XXXX-XX-XXXXXXX')
  assert.match(banks, /logoSrc:\s*['"]\/bank-logos\/kakaobank\.svg['"]/, 'KakaoBank should use a reliable local brand icon')
  assert.match(settings, /account_holder/, 'settings should render account holder input')
  assert.match(settings, /\{\s*label:\s*'전화번호',\s*value:\s*user\.phone\s*\}/, 'phone number should remain immutable as a read-only settings row')
  assert.doesNotMatch(settings, /type="tel"[\s\S]*onChange/, 'settings should not expose an editable phone input')
})

test('profile onboarding uses three phone boxes and keeps account number segmentation stable', () => {
  const signup = readProjectFile('components', 'auth', 'SignupForm.tsx')
  const settings = readProjectFile('app', 'settings', 'page.tsx')
  const bankFields = readProjectFile('components', 'BankAccountFields.tsx')
  const banks = readProjectFile('lib', 'banks.ts')

  assert.match(signup, /hasCheckedSessionRef/, 'signup session bootstrap should run only once so parent rerenders do not reset onboarding progress')
  assert.doesNotMatch(signup, /\[onSuccess,\s*supabase\]/, 'signup session bootstrap must not rerun whenever parent callbacks are recreated')
  assert.match(signup, /PhoneSegmentField/, 'signup should render the segmented phone component')
  assert.match(signup, /const segmentLengths = \[3, 4, 4\]/, 'phone number should use 010 / middle / last boxes')
  assert.match(signup, /grid-cols-\[0\.82fr_auto_1fr_auto_1fr\]/, 'phone boxes should be visually separated into three fields')
  assert.match(signup, /placeholder=\{index === 0 \? '010' : '0000'\}/, 'phone field should guide the expected values per segment')
  assert.match(signup, /joinPhoneSegments/, 'phone segments should be normalized into the existing 010-0000-0000 storage format')
  assert.match(bankFields, /inputRefs\.current = inputRefs\.current\.slice\(0, segments\.length\)/, 'account segment refs should be trimmed when bank format changes')
  assert.match(bankFields, /const pastedSegments = splitAccountNumberForBank\(bankName, digits\)/, 'pasted account numbers should be repartitioned by selected bank')
  assert.match(bankFields, /handleSegmentKeyDown/, 'account segment inputs should handle backward focus without crashing')
  assert.match(banks, /formatAccountNumberForBank/, 'bank helpers should format stored account numbers for display')
  assert.match(settings, /\.\.\.\(field === 'bank_name' \? \{ account_number: '' \} : \{\}\)/, 'changing bank should clear a stale account number format')
})
