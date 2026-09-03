import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const helperPath = join(process.cwd(), 'lib/analytics/landing.ts')

function loadLandingAnalyticsExports() {
  const source = readFileSync(helperPath, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })

  const module = { exports: {} }
  new Function('module', 'exports', outputText)(module, module.exports)
  return module.exports
}

test('anonymous landing is eligible only after auth resolution', () => {
  assert.equal(existsSync(helperPath), true)
  const { shouldTrackAnonymousLanding } = loadLandingAnalyticsExports()
  const base = {
    loading: false,
    hasAuthenticatedSession: false,
    hasEnteredApp: false,
    authMode: null,
    lastTrackedAt: null,
    now: 2_000_000,
  }

  assert.equal(shouldTrackAnonymousLanding(base), true)
  assert.equal(shouldTrackAnonymousLanding({ ...base, loading: true }), false)
  assert.equal(shouldTrackAnonymousLanding({ ...base, hasAuthenticatedSession: true }), false)
  assert.equal(shouldTrackAnonymousLanding({ ...base, hasEnteredApp: true }), false)
  assert.equal(shouldTrackAnonymousLanding({ ...base, authMode: 'signup' }), false)
})

test('anonymous landing is deduplicated for thirty minutes', () => {
  const { LANDING_VIEW_DEDUPE_MS, shouldTrackAnonymousLanding } = loadLandingAnalyticsExports()
  const base = {
    loading: false,
    hasAuthenticatedSession: false,
    hasEnteredApp: false,
    authMode: null,
    now: 2_000_000,
  }

  assert.equal(
    shouldTrackAnonymousLanding({
      ...base,
      lastTrackedAt: base.now - LANDING_VIEW_DEDUPE_MS + 1,
    }),
    false,
  )
  assert.equal(
    shouldTrackAnonymousLanding({
      ...base,
      lastTrackedAt: base.now - LANDING_VIEW_DEDUPE_MS,
    }),
    true,
  )
  assert.equal(shouldTrackAnonymousLanding({ ...base, lastTrackedAt: Number.NaN }), true)
})

test('home emits one anonymous landing event through the eligibility helper', () => {
  const source = readFileSync(join(process.cwd(), 'components/HomeClient.tsx'), 'utf8')

  assert.match(source, /shouldTrackAnonymousLanding/)
  assert.match(source, /LANDING_VIEW_LAST_TRACKED_AT_KEY/)
  assert.match(source, /landingViewLastTrackedAtFallbackRef/)
  assert.match(source, /window\.sessionStorage\.getItem\(LANDING_VIEW_LAST_TRACKED_AT_KEY\)/)
  assert.match(
    source,
    /window\.sessionStorage\.setItem\(LANDING_VIEW_LAST_TRACKED_AT_KEY, String\(now\)\)/,
  )
  assert.match(source, /trackEvent\('landing_viewed',\s*\{\s*auth_state:\s*'anonymous'/)
})
