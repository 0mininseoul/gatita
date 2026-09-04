# Dormitory Ride Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional dormitory-resident preference and turn eligible empty-supply map states into real ride-request rooms that notify eligible dormitory residents.

**Architecture:** Keep private residency and consent on `user_private_profiles`, distinguish request rooms with `chat_rooms.creation_source`, and reuse the existing room creation and push webhook paths. Put route eligibility and recipient merging in pure helpers so station-specific inventory, unrestricted Dormitory 2 destinations, and deduplication are testable without React or Supabase mocks.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Supabase Postgres/Auth, web-push, Amplitude, Node test runner

---

### Task 1: Persist Dormitory Consent and Room Source

**Files:**
- Modify: `test/dormitory-ride-request.test.mjs`
- Modify: `supabase/migrations/20260904035539_add_dormitory_ride_requests.sql`
- Modify: `supabase_schema.sql`
- Modify: `lib/supabase.ts`

- [x] **Step 1: Write the failing schema contract tests**

Create `test/dormitory-ride-request.test.mjs` with assertions that both the migration and canonical schema contain a nullable `is_dormitory_resident` private field, a defaulted `creation_source`, an allowed-value constraint, and a route constraint that permits any currently valid destination from Dormitory 2 while allowing only Dormitory 2 for station/main-gate requests:

```js
test('schema stores private dormitory consent and a constrained room source', () => {
  for (const source of [migration, schema]) {
    assert.match(source, /is_dormitory_resident\s+boolean/i)
    assert.match(source, /creation_source\s+text\s+not null\s+default 'standard'/i)
    assert.match(source, /creation_source in \('standard', 'dormitory_request'\)/i)
    assert.match(source, /from_location in \('가천대역_1번출구', '가천대학교_정문'\)[\s\S]*to_location = '제2기숙사'/i)
    assert.match(source, /from_location = '제2기숙사'[\s\S]*to_location in \('가천대역_1번출구', '가천대학교_정문', '교육대학원', '중앙도서관', '학생회관'\)/i)
  }
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test test/dormitory-ride-request.test.mjs`

Expected: FAIL because the generated migration is empty and the schema/types do not have the new fields.

- [x] **Step 3: Add the migration and canonical schema fields**

Fill the generated migration with the two columns, a partial recipient index, an allowed-source constraint, and a dormitory-request route constraint:

```sql
alter table public.user_private_profiles
  add column if not exists is_dormitory_resident boolean;

create index if not exists user_private_profiles_dormitory_push_idx
  on public.user_private_profiles (user_id)
  where is_dormitory_resident is true and push_enabled is true;

alter table public.chat_rooms
  add column if not exists creation_source text not null default 'standard';

alter table public.chat_rooms
  add constraint chat_rooms_creation_source_valid
  check (creation_source in ('standard', 'dormitory_request'));

alter table public.chat_rooms
  add constraint chat_rooms_dormitory_request_route_valid
  check (
    creation_source = 'standard'
    or (
      from_location in ('가천대역_1번출구', '가천대학교_정문')
      and to_location = '제2기숙사'
    )
    or (
      from_location = '제2기숙사'
      and to_location in ('가천대역_1번출구', '가천대학교_정문', '교육대학원', '중앙도서관', '학생회관')
    )
  );
```

Mirror the same columns, constraints, and index in `supabase_schema.sql`. Extend `PrivateProfile` with `is_dormitory_resident?: boolean | null` and `ChatRoom` with `creation_source: 'standard' | 'dormitory_request'`.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `node --test test/dormitory-ride-request.test.mjs`

Expected: PASS for the schema and type contracts.

- [x] **Step 5: Commit the data model**

```bash
git add test/dormitory-ride-request.test.mjs supabase/migrations/20260904035539_add_dormitory_ride_requests.sql supabase_schema.sql lib/supabase.ts
git commit -m "feat: store dormitory ride request preferences"
```

### Task 2: Define Route Eligibility and Push Recipient Rules

**Files:**
- Create: `lib/dormitoryRideRequest.ts`
- Modify: `lib/roomInventory.ts`
- Modify: `test/dormitory-ride-request.test.mjs`

- [x] **Step 1: Write failing pure behavior tests**

Add tests for these concrete cases:

```js
test('station requests require empty joinable supply specifically to Dormitory 2', () => {
  assert.equal(getDormitoryRequestAvailability([], '가천대역_1번출구', now).showBanner, true)
  assert.equal(getDormitoryRequestAvailability([
    room({ to_location: '중앙도서관' }),
  ], '가천대역_1번출구', now).showBanner, true)
  assert.equal(getDormitoryRequestAvailability([
    room({ to_location: '제2기숙사' }),
  ], '가천대역_1번출구', now).showBanner, false)
})

test('Dormitory 2 requests use origin-wide supply and selectable global destinations', () => {
  const availability = getDormitoryRequestAvailability([], '제2기숙사', now)
  assert.deepEqual(availability, { showBanner: true, destinationMode: 'selectable', fixedDestination: null })
  assert.deepEqual(getDormitoryRequestDestinationOptions('제2기숙사'), getDestinationOptions('제2기숙사'))
})

test('past and full rooms do not suppress a request banner', () => {
  assert.equal(getDormitoryRequestAvailability([pastRoom, fullRoom], '제2기숙사', now).showBanner, true)
})

test('recipient merge filters consent and global push, excludes creator, and deduplicates', () => {
  assert.deepEqual(mergeDormitoryRequestRecipientIds(
    ['route-user', 'shared-user', 'creator'],
    [
      { user_id: 'resident', is_dormitory_resident: true, push_enabled: true },
      { user_id: 'shared-user', is_dormitory_resident: true, push_enabled: true },
      { user_id: 'push-off', is_dormitory_resident: true, push_enabled: false },
      { user_id: 'not-resident', is_dormitory_resident: false, push_enabled: true },
    ],
    'creator',
  ).sort(), ['resident', 'route-user', 'shared-user'])
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test test/dormitory-ride-request.test.mjs`

Expected: FAIL because `lib/dormitoryRideRequest.ts`, `getRouteRoomInventory`, and the recipient helper do not exist.

- [x] **Step 3: Implement minimal pure helpers**

Add `getRouteRoomInventory` beside the origin helper, using the same joinable definition. In `lib/dormitoryRideRequest.ts`, export these stable contracts:

```ts
export const DORMITORY_REQUEST_DESTINATION: LocationType = '제2기숙사'
export type DormitoryDestinationMode = 'fixed' | 'selectable'

export function getDormitoryRequestAvailability(
  rooms: InventoryRoom[],
  fromLocation: LocationType,
  now = new Date(),
) {
  if (fromLocation === '제2기숙사') {
    return {
      showBanner: !getOriginRoomInventory(rooms, fromLocation, now).hasJoinableRoom,
      destinationMode: 'selectable' as const,
      fixedDestination: null,
    }
  }
  if (fromLocation === '가천대역_1번출구' || fromLocation === '가천대학교_정문') {
    return {
      showBanner: !getRouteRoomInventory(rooms, fromLocation, DORMITORY_REQUEST_DESTINATION, now).hasJoinableRoom,
      destinationMode: 'fixed' as const,
      fixedDestination: DORMITORY_REQUEST_DESTINATION,
    }
  }
  return { showBanner: false, destinationMode: 'fixed' as const, fixedDestination: null }
}
```

`getDormitoryRequestDestinationOptions` returns `getDestinationOptions(fromLocation)` without a dormitory-only filter. `mergeDormitoryRequestRecipientIds` unions eligible route and resident IDs in a `Set`, then excludes the creator.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `node --test test/dormitory-ride-request.test.mjs`

Expected: PASS for station, main-gate, Dormitory 2, past/full room, and recipient cases.

- [x] **Step 5: Commit the domain rules**

```bash
git add lib/dormitoryRideRequest.ts lib/roomInventory.ts test/dormitory-ride-request.test.mjs
git commit -m "feat: define dormitory request eligibility"
```

### Task 3: Add Optional Onboarding and Reversible Settings

**Files:**
- Modify: `app/api/profile/complete/route.ts`
- Modify: `app/api/profile/me/route.ts`
- Create: `app/api/profile/dormitory/route.ts`
- Modify: `components/auth/SignupForm.tsx`
- Modify: `app/settings/page.tsx`
- Modify: `test/dormitory-ride-request.test.mjs`

- [ ] **Step 1: Write failing profile contract tests**

Assert that profile completion accepts `boolean | null`, sends the selected value, and does not include it in required-step validation. Assert the authenticated settings route validates `true`, `false`, or `null`, updates only `authUser.id`, and the owner-only profile response includes the value. Assert the exact approved copy appears in onboarding:

```js
assert.match(signup, /기숙사생이신가요\?/)
assert.match(signup, /같이타에 가입한 다른 기숙사생들과 동행 요청을 주고 받을 수 있어요/)
assert.match(signup, /is_dormitory_resident: dormitoryResident/)
assert.doesNotMatch(signup, /if \(isLastStep && dormitoryResident === null\)/)
assert.match(settingsRoute, /auth\.getUser\(\)/)
assert.match(settingsRoute, /is_dormitory_resident: payload\.is_dormitory_resident/)
assert.match(settingsRoute, /\.eq\('user_id', authUser\.id\)/)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/dormitory-ride-request.test.mjs`

Expected: FAIL because the preference is absent from the APIs and UI.

- [ ] **Step 3: Extend profile completion and owner profile loading**

Parse the optional field with strict tri-state validation:

```ts
function parseDormitoryResident(value: unknown) {
  if (value === null || typeof value === 'undefined') return { value: null }
  if (typeof value !== 'boolean') return { error: '기숙사생 여부 값이 올바르지 않습니다' }
  return { value }
}
```

Store it in the existing private-profile upsert without changing any required-field rules. Include it only in the authenticated owner response from `/api/profile/me`.

- [ ] **Step 4: Add the authenticated settings update route**

Implement `PATCH /api/profile/dormitory` with `auth.getUser()`, strict tri-state validation, and a service-role update scoped to `.eq('user_id', authUser.id)`. Return `{ ok: true, is_dormitory_resident }` and never return other private-profile fields.

- [ ] **Step 5: Add onboarding and settings controls**

In the final review panel, render the exact main and supporting copy with `네` and `아니요` pressed buttons. Keep `null` as the initial value and make a selected answer reversible to `null`; render `선택하지 않아도 가입할 수 있어요`. Send the value during profile completion and, after success, emit:

```ts
trackEvent('dormitory_profile_answered', {
  is_dormitory_resident: dormitoryResident,
  source: 'onboarding',
})
```

In settings, initialize the control from `/api/profile/me`, persist changes through the new route, roll back on failure, and emit the same event with `source: 'settings'` only after a successful update. Do not call `Notification.requestPermission()` from either control.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `node --test test/dormitory-ride-request.test.mjs`

Expected: PASS for optional completion, copy, private response, authenticated update, and analytics contracts.

- [ ] **Step 7: Commit the profile experience**

```bash
git add app/api/profile/complete/route.ts app/api/profile/me/route.ts app/api/profile/dormitory/route.ts components/auth/SignupForm.tsx app/settings/page.tsx test/dormitory-ride-request.test.mjs
git commit -m "feat: collect optional dormitory preference"
```

### Task 4: Add the Empty-Supply Request Experience

**Files:**
- Modify: `components/CampusRouteMap.tsx`
- Modify: `components/HomeClient.tsx`
- Modify: `test/dormitory-ride-request.test.mjs`

- [ ] **Step 1: Write failing map and analytics contract tests**

Require the map to derive availability from the pure helper, deduplicate banner views per sheet opening, show `혹시 기숙사 가시나요?`, open a request mode, render `다른 기숙사생들에게 동행 요청을 보내드릴게요`, fix station/main-gate destination to Dormitory 2, and use all `getDestinationOptions('제2기숙사')` destinations for Dormitory 2. Require view, click, cancel, submit, and failure event names.

Require the room creation payload and insert to use:

```ts
creationSource?: 'standard' | 'dormitory_request'
creation_source: creationSource ?? 'standard'
```

and require `room_created` to include the source.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/dormitory-ride-request.test.mjs`

Expected: FAIL because the map only has standard room creation.

- [ ] **Step 3: Replace the boolean form mode with an explicit creation mode**

Use `type RoomCreationMode = 'standard' | 'dormitory_request' | null`. Preserve standard form behavior and abandonment analytics. Reset the destination and time on origin changes and cancellations. For fixed-mode requests set `draftDestination` to `제2기숙사`; for Dormitory 2 leave it selectable and use the existing global destination options unchanged.

- [ ] **Step 4: Render and instrument the banner and request sheet**

Show the compact banner only after inventory loading completes and `availability.showBanner` is true. Track one `dormitory_request_banner_viewed` per eligible origin per bottom-sheet opening. On click, track `dormitory_request_banner_clicked` and switch modes. On cancel or sheet dismissal, emit `dormitory_request_cancelled` once with `from_location`, `has_destination`, and `has_departure_time`.

The request panel must contain the exact approved promise copy and `요청하기`/`취소` actions. It must not contain `알림을 켠 기숙사생들에게 동행 요청을 알려드려요`.

- [ ] **Step 5: Reuse room creation with a source discriminator**

Pass `creationSource` to `HomeClient`. Keep the existing route validation, departure validation, duplicate lookup, insert, participant insert, rollback, and duplicate toast. Add `creation_source` to the insert and `creation_source` to `room_created`. Emit `dormitory_request_submitted` only after both room and participant are created; emit `dormitory_request_failed` with a stable `failure_stage` and `reason_code` for validation, duplicate, insert, and participant failures.

- [ ] **Step 6: Run the focused and existing activation tests**

Run: `node --test test/dormitory-ride-request.test.mjs test/activation-measurement.test.mjs`

Expected: PASS, with standard room analytics and empty-state measurement preserved.

- [ ] **Step 7: Commit the request experience**

```bash
git add components/CampusRouteMap.tsx components/HomeClient.tsx test/dormitory-ride-request.test.mjs
git commit -m "feat: create rooms from dormitory requests"
```

### Task 5: Notify Eligible Dormitory Residents

**Files:**
- Modify: `app/api/push/dispatch/route.ts`
- Modify: `test/push-dispatch-route.test.mjs`
- Modify: `test/dormitory-ride-request.test.mjs`

- [ ] **Step 1: Write failing dispatcher contract tests**

Require the room query to select `creation_source`. Require the resident query to run only for `dormitory_request`, select `user_id, is_dormitory_resident, push_enabled`, filter both booleans to true at the database boundary, merge through `mergeDormitoryRequestRecipientIds`, and call `sendToSubscriptions` once with the deduplicated union. Require standard rooms to use only existing exact-route subscribers.

- [ ] **Step 2: Run the dispatcher tests and verify RED**

Run: `node --test test/push-dispatch-route.test.mjs test/dormitory-ride-request.test.mjs`

Expected: FAIL because the dispatcher does not read `creation_source` or resident preferences.

- [ ] **Step 3: Extend the protected room dispatcher**

Select `creation_source` with the room. Keep exact-route `shouldNotify` filtering as-is. For a dormitory request, load only service-role private-profile rows matching both booleans:

```ts
admin
  .from('user_private_profiles')
  .select('user_id, is_dormitory_resident, push_enabled')
  .eq('is_dormitory_resident', true)
  .eq('push_enabled', true)
```

Merge with the pure helper so the creator is excluded and users present in both audiences receive one notification per push endpoint. Use a dormitory-request title/body while preserving room URL and tag semantics. A failed resident lookup logs the database error and falls back to exact-route recipients without failing room creation.

- [ ] **Step 4: Run the dispatcher tests and verify GREEN**

Run: `node --test test/push-dispatch-route.test.mjs test/dormitory-ride-request.test.mjs`

Expected: PASS for secret protection, standard alerts, dormitory fanout, filtering, exclusion, and deduplication.

- [ ] **Step 5: Commit the push fanout**

```bash
git add app/api/push/dispatch/route.ts test/push-dispatch-route.test.mjs test/dormitory-ride-request.test.mjs
git commit -m "feat: notify dormitory residents of ride requests"
```

### Task 6: Disclose the Preference and Verify the Complete Feature

**Files:**
- Modify: `app/privacy/page.tsx`
- Modify: `test/dormitory-ride-request.test.mjs`
- Modify: `docs/superpowers/specs/2026-09-04-dormitory-ride-request-design.md`
- Modify: `docs/superpowers/plans/2026-09-04-dormitory-ride-request.md`

- [ ] **Step 1: Write the failing privacy contract test**

Require the privacy policy to disclose the optional dormitory-resident signal, its use for selecting ride-request notification recipients, and reversibility in settings.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/dormitory-ride-request.test.mjs`

Expected: FAIL because the policy predates this data use.

- [ ] **Step 3: Update the privacy policy and design status**

Add the optional signal to the processed-information table and explain that it is used only to select recipients for dormitory ride-request notifications, is not exposed to other users, and can be changed in settings. Change the design status from `Awaiting product review` to `Approved and implemented` only after the feature tests pass.

- [ ] **Step 4: Run all automated verification**

Run:

```bash
npm test
npm run lint
set -a; source ../gatita/.env.local; set +a; npm run build
git diff --check
```

Expected: all tests pass with zero failures, lint exits 0, all Next.js routes build, and no whitespace errors appear. Existing dependency/browser-data warnings may remain if they are unchanged from baseline.

- [ ] **Step 5: Validate Supabase artifacts**

Run:

```bash
supabase migration list --local
supabase db lint --local
```

Expected: the generated migration appears in the local list and schema lint reports no new errors. If the repository has no running local Supabase stack, record the unavailable command as an environment limitation and verify the SQL with a temporary local Postgres/Supabase stack before deployment.

- [ ] **Step 6: Manually verify mobile-width behavior**

At a 390px viewport, verify optional onboarding selection/unselection, settings persistence, station fixed destination, Dormitory 2 unrestricted existing destination list, banner suppression by a joinable relevant room, past/full room behavior, cancellation, successful room creation, and absence of overflow or obscured controls.

- [ ] **Step 7: Commit the final verified state**

```bash
git add app/privacy/page.tsx test/dormitory-ride-request.test.mjs docs/superpowers/specs/2026-09-04-dormitory-ride-request-design.md docs/superpowers/plans/2026-09-04-dormitory-ride-request.md
git commit -m "docs: disclose and verify dormitory requests"
```

- [ ] **Step 8: Review, push, open the PR, and merge**

Run the repository review workflow against the full branch diff, fix any findings with focused regression tests, push `0mininseoul/amplitude-user-funnel-chart`, open or update its pull request, wait for required checks, and merge only after the review is clean.
