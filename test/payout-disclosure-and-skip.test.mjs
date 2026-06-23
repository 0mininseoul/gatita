import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = process.cwd()
const readProjectFile = (...parts) => readFileSync(join(root, ...parts), 'utf8')

test('onboarding lets users skip the payout account step', () => {
  const signup = readProjectFile('components', 'auth', 'SignupForm.tsx')
  const completeRoute = readProjectFile('app', 'api', 'profile', 'complete', 'route.ts')

  assert.match(signup, /나중에 입력할게요/, 'payout step should offer a skip action')
  assert.match(signup, /payoutSkipped/, 'signup should track the skipped state')

  assert.match(completeRoute, /hasAnyAccountField/, 'complete route should allow all-empty account fields')
  assert.match(completeRoute, /bank_name: validated\.data\.bankName \|\| null/, 'skipped account should be stored as null')
})

test('chat_rooms schema tracks payout disclosure timing', () => {
  const schema = readProjectFile('supabase_schema.sql')
  assert.match(schema, /payout_revealed_at/, 'chat_rooms should track when the payout account is disclosed')
})

test('private route gates payout account behind disclosure', () => {
  const route = readProjectFile('app', 'api', 'rooms', '[id]', 'private', 'route.ts')
  assert.match(route, /payout_revealed_at/, 'private route should read disclosure timestamp')
  assert.match(route, /isCreator \|\| payoutRevealed/, 'account should only be sent to creator or after disclosure')
  assert.match(route, /creatorHasPayoutAccount/, 'route should report whether the host registered an account')
  assert.match(route, /payoutRevealed/, 'route should report disclosure state')
})

test('reveal-payout route lets only the host disclose', () => {
  const route = readProjectFile('app', 'api', 'rooms', '[id]', 'reveal-payout', 'route.ts')
  assert.match(route, /created_by !== authUser\.id/, 'only the room creator may reveal')
  assert.match(route, /계좌를 먼저 등록해주세요/, 'reveal requires a registered account')
  assert.match(route, /payout_revealed_at: new Date\(\)\.toISOString\(\)/, 'reveal sets the disclosure timestamp')
  assert.match(route, /export const POST/, 'reveal should be a POST route')
})

test('chat room renders payout disclosure states and inline registration', () => {
  const source = readProjectFile('app', 'rooms', '[id]', 'page.tsx')
  assert.match(source, /reveal-payout/, 'host should call the reveal route')
  assert.match(source, /전체 공개/, 'host should see a disclose button')
  assert.match(source, /방장이 계좌를 아직 공개하지 않았어요/, 'guests should see a not-yet-disclosed message')
  assert.match(source, /방장이 아직 계좌를 등록하지 않았어요/, 'guests should see a not-registered message')
  assert.match(source, /계좌 등록하기/, 'host without an account should get an inline register button')
  assert.match(source, /payoutRevealed/, 'page should track disclosure state')
  assert.match(source, /creatorHasPayoutAccount/, 'page should track whether the host has an account')
  assert.match(source, /handleInlineAccountSave/, 'inline account form should save through the payout route')
})
