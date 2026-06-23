import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = process.cwd()
const readProjectFile = (...parts) => readFileSync(join(root, ...parts), 'utf8')

test('account number segments accept pasted full numbers', () => {
  const fields = readProjectFile('components', 'BankAccountFields.tsx')
  assert.match(fields, /onPaste=/, 'segment inputs should handle paste explicitly')
  assert.match(fields, /clipboardData/, 'paste handler should read clipboard text')
  assert.match(fields, /splitAccountNumberForBank\(bankName, pastedDigits\)/, 'paste should redistribute digits across all segments')
})

test('nickname generator picks a fixed sample and appends digits within length limit', () => {
  const lib = readProjectFile('lib', 'nicknames.ts')
  assert.match(lib, /export const NICKNAME_SAMPLES/, 'should expose a fixed sample list')
  assert.match(lib, /가천대 존잘남/, 'should include the user-provided samples')
  assert.match(lib, /가천대 존예여신/, 'should include 가천대 존예여신 sample')
  assert.match(lib, /길여키즈/, 'should include 길여키즈 sample')
  assert.match(lib, /export function generateRandomNickname/, 'should expose a generator')
  assert.match(lib, /10 - base\.length/, 'digit count should be capped so result stays within 10 chars')

  const signup = readProjectFile('components', 'auth', 'SignupForm.tsx')
  assert.match(signup, /generateRandomNickname/, 'signup should use the generator')
  assert.match(signup, /랜덤 추천/, 'signup should render the random suggestion button')
})
