# Activation Measurement and Room Inventory Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument the first two days of the activation plan so Amplitude can distinguish unavailable room supply from weak intent and measure room creation or joining as one activation outcome.

**Architecture:** A pure room-inventory helper will be the single definition of origin-level visible and joinable supply. `HomeClient` will attach that result to fixed-point selection events, while `CampusRouteMap` will own bottom-sheet exposure and create-form abandonment lifecycle events. Amplitude will receive a reusable create-or-join custom event and two new saved funnels without modifying the existing core funnel.

**Tech Stack:** Next.js 14, React, TypeScript, Supabase room data, Amplitude Analytics Browser SDK, Node test runner, Aside Browser CLI

---

### Task 1: Add a pure origin inventory helper

**Files:**
- Create: `lib/roomInventory.ts`
- Create: `test/activation-measurement.test.mjs`

- [x] **Step 1: Write the failing inventory tests**

Create a TypeScript-loading test that imports `getOriginRoomInventory` and covers past, full, joinable, and other-origin rooms:

```js
test('origin inventory separates visible rooms from rooms that can still be joined', () => {
  const now = new Date('2026-09-04T18:00:00+09:00')
  const rooms = [
    room({ id: 'past', departure_time: '17:00:00' }),
    room({ id: 'full', departure_time: '19:00:00', max_participants: 2, participants: [{ id: '1' }, { id: '2' }] }),
    room({ id: 'joinable', departure_time: '20:00:00', participants: [{ id: '1' }] }),
    room({ id: 'other', from_location: '제2기숙사', departure_time: '20:00:00' }),
  ]

  assert.deepEqual(getOriginRoomInventory(rooms, '가천대역_1번출구', now), {
    visibleRoomCount: 3,
    joinableRoomCount: 1,
    hasJoinableRoom: true,
  })
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test test/activation-measurement.test.mjs`

Expected: FAIL because `lib/roomInventory.ts` or `getOriginRoomInventory` does not exist.

- [x] **Step 3: Implement the minimal helper**

Create `lib/roomInventory.ts` with a small structural room type and the shared `isRoomJoinable` rule:

```ts
import { isRoomJoinable, type LocationType } from '@/lib/supabase'

export type InventoryRoom = {
  from_location: LocationType
  departure_date: string
  departure_time: string
  max_participants: number
  participants?: Array<{ id: string }>
}

export function getOriginRoomInventory(
  rooms: InventoryRoom[],
  fromLocation: LocationType,
  now = new Date(),
) {
  const visibleRooms = rooms.filter((room) => room.from_location === fromLocation)
  const joinableRoomCount = visibleRooms.filter((room) => (
    isRoomJoinable(room.departure_date, room.departure_time, now)
    && (room.participants?.length ?? 0) < room.max_participants
  )).length

  return {
    visibleRoomCount: visibleRooms.length,
    joinableRoomCount,
    hasJoinableRoom: joinableRoomCount > 0,
  }
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `node --test test/activation-measurement.test.mjs`

Expected: PASS for past, full, joinable, empty, and other-origin cases.

- [x] **Step 5: Commit the helper**

```bash
git add lib/roomInventory.ts test/activation-measurement.test.mjs
git commit -m "feat: define actionable room inventory"
```

### Task 2: Enrich fixed-point selection analytics

**Files:**
- Modify: `components/HomeClient.tsx:1305-1333`
- Modify: `test/activation-measurement.test.mjs`

- [x] **Step 1: Write the failing event-contract test**

Add a source contract requiring `fixed_point_selected` to use the pure helper and include all inventory properties:

```js
test('fixed point selection records resolved actionable inventory', () => {
  const source = readProjectFile('components/HomeClient.tsx')

  assert.match(source, /getOriginRoomInventory\(mapRooms, location\)/)
  assert.match(source, /visible_room_count: inventory\.visibleRoomCount/)
  assert.match(source, /joinable_room_count: inventory\.joinableRoomCount/)
  assert.match(source, /has_joinable_room: inventory\.hasJoinableRoom/)
  assert.match(source, /inventory_state: isLoadingMapRooms \? 'loading' : 'ready'/)
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test test/activation-measurement.test.mjs`

Expected: FAIL because `fixed_point_selected` has only `from_location`.

- [x] **Step 3: Add inventory properties to the event**

Import the helper, calculate it inside the non-empty location branch, and keep the existing event name:

```ts
const inventory = getOriginRoomInventory(mapRooms, location)
trackEvent('fixed_point_selected', {
  from_location: location,
  visible_room_count: inventory.visibleRoomCount,
  joinable_room_count: inventory.joinableRoomCount,
  has_joinable_room: inventory.hasJoinableRoom,
  inventory_state: isLoadingMapRooms ? 'loading' : 'ready',
})
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `node --test test/activation-measurement.test.mjs`

Expected: PASS.

- [x] **Step 5: Commit the fixed-point event change**

```bash
git add components/HomeClient.tsx test/activation-measurement.test.mjs
git commit -m "feat: measure supply on fixed point selection"
```

### Task 3: Track empty supply exposure and form abandonment

**Files:**
- Modify: `components/CampusRouteMap.tsx:189-277`
- Modify: `components/CampusRouteMap.tsx:436-483`
- Modify: `components/CampusRouteMap.tsx:774-875`
- Modify: `test/activation-measurement.test.mjs`

- [x] **Step 1: Write the failing bottom-sheet lifecycle tests**

Require the new event contracts, a per-opening empty-state set, and a form-attempt ref whose close/origin-change emission is suppressed after submission:

```js
test('map sheet records actionable empty state once per opening', () => {
  const source = readProjectFile('components/CampusRouteMap.tsx')
  assert.match(source, /room_empty_state_viewed/)
  assert.match(source, /emptyStateOriginsRef/)
  assert.match(source, /joinable_room_count: 0/)
  assert.match(source, /source: 'map_bottom_sheet'/)
})

test('create form records close and origin-change abandonment only before submit', () => {
  const source = readProjectFile('components/CampusRouteMap.tsx')
  assert.match(source, /room_create_form_abandoned/)
  assert.match(source, /reason: 'sheet_closed' \| 'origin_changed'/)
  assert.match(source, /has_destination:/)
  assert.match(source, /has_departure_time:/)
  assert.match(source, /createAttemptRef\.current\.submitted = true/)
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test test/activation-measurement.test.mjs`

Expected: FAIL because neither lifecycle event exists.

- [x] **Step 3: Add refs and derived inventory**

Import `getOriginRoomInventory`, compute the selected origin inventory, and add refs:

```ts
const emptyStateOriginsRef = useRef(new Set<LocationType>())
const createAttemptRef = useRef<{
  fromLocation: LocationType
  submitted: boolean
  abandoned: boolean
} | null>(null)

const selectedOriginInventory = selectedFrom
  ? getOriginRoomInventory(rooms, selectedFrom)
  : { visibleRoomCount: 0, joinableRoomCount: 0, hasJoinableRoom: false }
```

- [x] **Step 4: Emit the empty-supply event after loading**

Add an effect that resets only when the sheet fully closes and deduplicates each origin during that opening:

```ts
useEffect(() => {
  if (!selectedFrom) {
    emptyStateOriginsRef.current.clear()
    return
  }
  if (isLoading || selectedOriginInventory.hasJoinableRoom) return
  if (emptyStateOriginsRef.current.has(selectedFrom)) return

  emptyStateOriginsRef.current.add(selectedFrom)
  trackEvent('room_empty_state_viewed', {
    from_location: selectedFrom,
    visible_room_count: selectedOriginInventory.visibleRoomCount,
    joinable_room_count: 0,
    source: 'map_bottom_sheet',
  })
}, [isLoading, selectedFrom, selectedOriginInventory.hasJoinableRoom, selectedOriginInventory.visibleRoomCount])
```

- [x] **Step 5: Add a single abandonment emitter**

Use current draft values without including raw destination or time values:

```ts
const trackCreateFormAbandonment = useCallback((reason: 'sheet_closed' | 'origin_changed') => {
  const attempt = createAttemptRef.current
  if (!attempt || attempt.submitted || attempt.abandoned) return

  attempt.abandoned = true
  trackEvent('room_create_form_abandoned', {
    from_location: attempt.fromLocation,
    has_destination: Boolean(draftDestination),
    has_departure_time: Boolean(draftDepartureTime),
    reason,
    source: 'map_bottom_sheet',
  })
}, [draftDepartureTime, draftDestination])
```

Call it with `origin_changed` before selecting a different origin, call it with `sheet_closed` before closing the sheet, initialize the ref when the form opens, and set `submitted = true` immediately before a valid `onCreateRoom` call.

- [x] **Step 6: Run the focused tests and verify GREEN**

Run: `node --test test/activation-measurement.test.mjs`

Expected: PASS with one empty-state contract and both abandonment reasons protected by deduplication/submission state.

- [x] **Step 7: Commit the lifecycle analytics**

```bash
git add components/CampusRouteMap.tsx test/activation-measurement.test.mjs
git commit -m "feat: track empty room supply and form abandonment"
```

### Task 4: Create and verify Amplitude activation definitions

**Files:**
- No repository files

- [x] **Step 1: Start Aside Browser and inspect available Amplitude skill support**

Run: `aside -h` followed by `aside skills list` after the browser is running.

Expected: Aside reports an authenticated browser session and any matching Amplitude skill.

- [x] **Step 2: Create the custom event and saved funnels**

Run Aside with this exact task:

```text
Open the Gatita Amplitude project. Create a custom event named “[Activation] Room Activated” that is the union of room_created and room_joined. Do not edit or delete existing charts. Create a new ordered unique-user funnel named “[Activation v2] Core Activation” with a seven-day conversion window: login_succeeded (method=google) → profile_completed → map_opened (profile_completed=true) → fixed_point_selected → [Activation] Room Activated → chat_message_sent. Create another ordered unique-user funnel named “[Activation] New User Profile Completion” with a 24-hour conversion window: login_succeeded (method=google, profile_completed=false) → profile_setup_started → profile_completed. For both charts use Asia/Seoul, start 2026-06-22, environment=production, and exclude the same four internal Supabase user IDs used by the existing core activation chart. Save both charts and return their URLs and owner account. Reopen each saved chart and verify every step, filter, exclusion, window, and timezone.
```

- [x] **Step 3: Verify saved definitions by reopening them**

Expected: Both saved URLs load without errors, existing charts are unchanged, and Aside reports the exact saved configuration and owner.

### Task 5: Run the complete verification gate

**Files:**
- Modify: `docs/superpowers/plans/2026-09-04-activation-measurement-hygiene.md`

- [x] **Step 1: Run all automated tests**

Run: `npm test`

Expected: exit code 0 and zero failed tests.

- [x] **Step 2: Run lint**

Run: `npm run lint`

Expected: exit code 0 and zero lint errors.

- [x] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit code 0 and all Next.js routes compile successfully.

- [x] **Step 4: Check the final diff and spec coverage**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only the planned measurement files are changed.

- [x] **Step 5: Commit the verified implementation**

```bash
git add docs/superpowers/plans/2026-09-04-activation-measurement-hygiene.md
git commit -m "docs: add activation measurement implementation plan"
```
