# Acquisition and PWA Funnels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clean anonymous landing event and create reliable acquisition and PWA installation funnels in Amplitude.

**Architecture:** Keep eligibility logic in a small pure analytics helper so its authentication and deduplication rules can be tested directly. `HomeClient` owns browser storage and emits the event only after authentication resolution. Reuse the existing PWA instruction and installation events, changing only the Amplitude funnel definition.

**Tech Stack:** Next.js 14, React, TypeScript, Node test runner, Amplitude Analytics Browser SDK, Amplitude connector, Aside CLI

---

### Task 1: Specify the anonymous landing eligibility contract

**Files:**
- Create: `test/landing-analytics.test.mjs`
- Create: `lib/analytics/landing.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `test/landing-analytics.test.mjs` with a TypeScript transpile loader matching the repository's existing tests. Test that the helper accepts only a resolved anonymous landing and enforces a 30-minute boundary:

```js
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const helperPath = join(process.cwd(), 'lib/analytics/landing.ts')

function loadLandingAnalyticsExports() {
  const source = readFileSync(helperPath, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  })
  const module = { exports: {} }
  new Function('module', 'exports', outputText)(module, module.exports)
  return module.exports
}

test('anonymous landing is eligible only after auth resolution', () => {
  assert.equal(existsSync(helperPath), true)
  const { shouldTrackAnonymousLanding } = loadLandingAnalyticsExports()
  const base = { loading: false, hasAuthenticatedSession: false, hasEnteredApp: false, authMode: null, lastTrackedAt: null, now: 2_000_000 }
  assert.equal(shouldTrackAnonymousLanding(base), true)
  assert.equal(shouldTrackAnonymousLanding({ ...base, loading: true }), false)
  assert.equal(shouldTrackAnonymousLanding({ ...base, hasAuthenticatedSession: true }), false)
  assert.equal(shouldTrackAnonymousLanding({ ...base, hasEnteredApp: true }), false)
  assert.equal(shouldTrackAnonymousLanding({ ...base, authMode: 'signup' }), false)
})

test('anonymous landing is deduplicated for thirty minutes', () => {
  const { LANDING_VIEW_DEDUPE_MS, shouldTrackAnonymousLanding } = loadLandingAnalyticsExports()
  const base = { loading: false, hasAuthenticatedSession: false, hasEnteredApp: false, authMode: null, now: 2_000_000 }
  assert.equal(shouldTrackAnonymousLanding({ ...base, lastTrackedAt: base.now - LANDING_VIEW_DEDUPE_MS + 1 }), false)
  assert.equal(shouldTrackAnonymousLanding({ ...base, lastTrackedAt: base.now - LANDING_VIEW_DEDUPE_MS }), true)
  assert.equal(shouldTrackAnonymousLanding({ ...base, lastTrackedAt: Number.NaN }), true)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/landing-analytics.test.mjs`

Expected: FAIL because `lib/analytics/landing.ts` does not exist.

- [ ] **Step 3: Implement the pure helper**

Create `lib/analytics/landing.ts`:

```ts
export const LANDING_VIEW_DEDUPE_MS = 30 * 60 * 1000

type AnonymousLandingState = {
  loading: boolean
  hasAuthenticatedSession: boolean
  hasEnteredApp: boolean
  authMode: string | null
  lastTrackedAt: number | null
  now: number
}

export function shouldTrackAnonymousLanding(state: AnonymousLandingState) {
  if (state.loading || state.hasAuthenticatedSession || state.hasEnteredApp || state.authMode === 'signup') {
    return false
  }
  if (!Number.isFinite(state.lastTrackedAt)) return true
  return state.now - (state.lastTrackedAt as number) >= LANDING_VIEW_DEDUPE_MS
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test test/landing-analytics.test.mjs`

Expected: 2 tests pass, 0 fail.

### Task 2: Emit `landing_viewed` from the authenticated landing boundary

**Files:**
- Modify: `test/landing-analytics.test.mjs`
- Modify: `components/HomeClient.tsx`

- [ ] **Step 1: Add a failing integration contract test**

Append a source contract test that requires `HomeClient` to import the helper, guard storage, maintain a memory fallback, and emit the canonical event:

```js
test('home emits one anonymous landing event through the eligibility helper', () => {
  const source = readFileSync(join(process.cwd(), 'components/HomeClient.tsx'), 'utf8')
  assert.match(source, /shouldTrackAnonymousLanding/)
  assert.match(source, /LANDING_VIEW_LAST_TRACKED_AT_KEY/)
  assert.match(source, /landingViewLastTrackedAtFallbackRef/)
  assert.match(source, /window\.sessionStorage\.getItem\(LANDING_VIEW_LAST_TRACKED_AT_KEY\)/)
  assert.match(source, /window\.sessionStorage\.setItem\(LANDING_VIEW_LAST_TRACKED_AT_KEY, String\(now\)\)/)
  assert.match(source, /trackEvent\('landing_viewed',\s*\{\s*auth_state:\s*'anonymous'/)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/landing-analytics.test.mjs`

Expected: helper tests pass and the new HomeClient contract test fails because `landing_viewed` is absent.

- [ ] **Step 3: Add the minimal HomeClient integration**

Import `shouldTrackAnonymousLanding`, add `LANDING_VIEW_LAST_TRACKED_AT_KEY`, add `landingViewLastTrackedAtFallbackRef`, and add an effect after the derived authentication state:

```ts
useEffect(() => {
  const now = Date.now()
  let lastTrackedAt = landingViewLastTrackedAtFallbackRef.current

  try {
    const storedAt = Number(window.sessionStorage.getItem(LANDING_VIEW_LAST_TRACKED_AT_KEY))
    if (Number.isFinite(storedAt) && storedAt > 0) lastTrackedAt = storedAt
  } catch {
    // The in-memory fallback still prevents repeats during this page lifecycle.
  }

  if (!shouldTrackAnonymousLanding({
    loading,
    hasAuthenticatedSession,
    hasEnteredApp,
    authMode,
    lastTrackedAt,
    now,
  })) return

  landingViewLastTrackedAtFallbackRef.current = now
  try {
    window.sessionStorage.setItem(LANDING_VIEW_LAST_TRACKED_AT_KEY, String(now))
  } catch {
    // Analytics must not block the landing page when storage is unavailable.
  }
  trackEvent('landing_viewed', { auth_state: 'anonymous' })
}, [authMode, hasAuthenticatedSession, hasEnteredApp, loading])
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test test/landing-analytics.test.mjs`

Expected: 3 tests pass, 0 fail.

- [ ] **Step 5: Commit the code unit**

```bash
git add test/landing-analytics.test.mjs lib/analytics/landing.ts components/HomeClient.tsx
git commit -m "feat: track resolved anonymous landing views"
```

### Task 3: Verify the existing PWA event contract

**Files:**
- Verify: `components/HomeClient.tsx`
- Verify: `test/pwa-install-sync.test.mjs`

- [ ] **Step 1: Confirm the reusable event stages**

Check that `pwa_install_instruction_shown` is emitted with `source: 'map_onboarding'`, `pwa_installed_detected` is emitted for `appinstalled` and standalone opening, and the Supabase sync remains before local analytics deduplication.

- [ ] **Step 2: Run the PWA regression test**

Run: `node --test test/pwa-install-sync.test.mjs`

Expected: 2 tests pass, 0 fail.

No production change is required for PWA event emission because the needed instruction exposure event already exists.

### Task 4: Run repository verification

**Files:**
- Verify all changed code and existing tests

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: all tests pass with 0 failures.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: exit 0 with no ESLint errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit 0 and Next.js reports a successful optimized production build.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff HEAD~1 --check && git status --short`

Expected: no whitespace errors; only intended plan/code files appear.

### Task 5: Create and verify the Amplitude funnels

**Files:**
- External: Amplitude project `GATITA` (`801958`)

- [ ] **Step 1: Create the acquisition funnel**

Create a saved ordered unique-user funnel with `landing_viewed(auth_state=anonymous, environment=production)` followed by `login_succeeded(method=google, environment=production)`, a 30-minute conversion window, `Asia/Seoul`, and a start date of 2026-09-04. Exclude the four known internal Supabase user UUIDs. If Amplitude rejects the not-yet-ingested event, report the exact limitation and retain the ready definition for creation immediately after deployment ingestion.

- [ ] **Step 2: Create the PWA installation funnel**

Create a saved ordered unique-user funnel with `login_succeeded(method=google, environment=production)`, `map_opened(profile_completed=true, environment=production)`, `pwa_install_instruction_shown(source=map_onboarding, environment=production)`, and `pwa_installed_detected(environment=production)`. Use a seven-day conversion window, `Asia/Seoul`, a 2026-06-22 start date, and the same internal UUID exclusion.

- [ ] **Step 3: Verify saved definitions and query results**

Retrieve both saved chart definitions and query their data. Confirm exact events, property filters, conversion windows, timezone, dates, and internal-user segment.

- [ ] **Step 4: Verify the Amplitude UI with Aside CLI**

Open each chart in the existing authenticated Amplitude browser session and confirm that the visible UI matches the retrieved definition.

### Task 6: Final handoff

**Files:**
- Verify: Git history and working tree

- [ ] **Step 1: Report delivered behavior and limitations**

Provide chart links, code links, test/build evidence, the PWA event decision, and the acquisition chart's no-backfill limitation. State clearly that deployment was not performed unless separately authorized.
