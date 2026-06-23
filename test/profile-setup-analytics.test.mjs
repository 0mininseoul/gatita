import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = process.cwd()
const readProjectFile = (...parts) => readFileSync(join(root, ...parts), 'utf8')

test('profile setup analytics records step views and exits with one setup session id', () => {
  const signup = readProjectFile('components', 'auth', 'SignupForm.tsx')

  assert.match(signup, /PROFILE_SETUP_SESSION_STORAGE_KEY/, 'profile setup should keep a stable analytics session id')
  assert.match(signup, /setup_session_id/, 'profile setup events should include the setup session id')
  assert.match(signup, /profile_setup_step_viewed/, 'each onboarding step should emit a viewed event')
  assert.match(signup, /profile_setup_exited/, 'profile setup should emit an explicit exit event')
  assert.match(signup, /exit_type/, 'exit events should explain how the user left')
  assert.match(signup, /last_completed_step_id/, 'exit events should include the last completed step')
  assert.match(signup, /window\.addEventListener\('pagehide'/, 'browser tab closes and navigations should be tracked')
  assert.match(signup, /document\.addEventListener\('visibilitychange'/, 'backgrounding the page should be tracked on mobile')
})

test('profile setup analytics keeps a session id when browser session storage is blocked', () => {
  const signup = readProjectFile('components', 'auth', 'SignupForm.tsx')

  assert.match(signup, /let profileSetupSessionIdFallback: string \| null = null/, 'analytics should keep an in-memory fallback session id')
  assert.match(signup, /function readProfileSetupSessionIdFromStorage\(\)[\s\S]*try[\s\S]*window\.sessionStorage\.getItem/, 'session id reads should be guarded')
  assert.match(signup, /function writeProfileSetupSessionIdToStorage\(sessionId: string\)[\s\S]*try[\s\S]*window\.sessionStorage\.setItem/, 'session id writes should be guarded')
  assert.match(signup, /function removeProfileSetupSessionIdFromStorage\(\)[\s\S]*try[\s\S]*window\.sessionStorage\.removeItem/, 'session id removal should be guarded')
  assert.match(signup, /profileSetupSessionIdFallback = nextSessionId/, 'blocked storage should still keep the generated id stable for the current attempt')
  assert.match(signup, /profileSetupSessionIdFallback = null/, 'profile completion should reset the in-memory fallback id')
})

test('profile setup analytics records blocked progress and navigation actions', () => {
  const signup = readProjectFile('components', 'auth', 'SignupForm.tsx')

  assert.match(signup, /profile_setup_validation_failed/, 'validation failures should be tracked')
  assert.match(signup, /invalid_fields/, 'validation failure events should include invalid fields')
  assert.match(signup, /error_count/, 'validation failure events should include error count')
  assert.match(signup, /profile_setup_back_clicked/, 'back button usage should be tracked')
  assert.match(signup, /profile_setup_previous_step_opened/, 'editing a completed previous step should be tracked')
})

test('profile-required modal analytics records prompt exposure and dismissal', () => {
  const page = readProjectFile('app', 'page.tsx')

  assert.match(page, /profile_required_modal_shown/, 'automatic profile-required prompt exposure should be tracked')
  assert.match(page, /profile_required_modal_dismissed/, 'profile-required prompt dismissal should be tracked')
  assert.match(page, /dismiss_type/, 'modal dismissal events should include the dismissal type')
})
