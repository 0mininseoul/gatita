# Activation Measurement and Room Inventory Hygiene Design

## Goal

Make the first two days of the activation plan measurable without changing the user-facing room lifecycle. The work must distinguish an empty marketplace from weak user intent, define room activation by the actual create-or-join outcome, and isolate new-user profile completion from returning-user behavior.

## Scope

### In scope

- Enrich map fixed-point analytics with the room inventory the user could actually act on.
- Record an explicit empty-state exposure and creation-form abandonment.
- Define an Amplitude custom activation event as `room_created OR room_joined`.
- Save a v2 core activation funnel that uses the custom activation event.
- Save a separate new-user profile funnel beginning with `login_succeeded(profile_completed=false)`.
- Keep all production filters, KST settings, the 2026-06-22 start date, and the four internal-account exclusions.
- Add tests for event names, required properties, inventory counting, and abandonment deduplication.

### Out of scope

- Dormitory affiliation, dormitory request banners, automatic room creation, or dormitory-targeted push.
- Redesigning the room creation form or profile fields.
- Closing or deleting historical rooms.
- A separate route-subscription funnel.

## Corrected Room-Lifecycle Decision

Do not mass-close the 17 rooms whose departure timestamps have passed.

`chat_rooms.status = 'active'` currently also preserves participant access to post-departure chat and settlement. `HomeClient` loads “My Rooms” with `status = 'active'`, and the room UI deliberately allows a participant to reopen a past room. Updating those rows to `closed` would therefore change product behavior and could hide settlement conversations.

Availability metrics must instead use a derived `joinable` definition:

```text
status = active
AND departure timestamp is in the future under Asia/Seoul rules
AND participant_count < max_participants
```

Historical active rows remain stored. They are excluded from available-supply metrics by the departure timestamp.

## Client Analytics Contract

### `fixed_point_selected`

Keep the existing event and add:

- `from_location`
- `visible_room_count`: active rooms currently loaded for the origin, including past rooms intentionally visible today
- `joinable_room_count`: rooms with a future departure and remaining capacity
- `has_joinable_room`: `joinable_room_count > 0`
- `inventory_state`: `loading | ready`

The selection event remains a weak-intent signal, but now supports a direct comparison between users who saw supply and users who saw none.

### `room_empty_state_viewed`

Emit after the bottom sheet is open, room loading is complete, and `joinable_room_count = 0`.

Properties:

- `from_location`
- `visible_room_count`
- `joinable_room_count: 0`
- `source: map_bottom_sheet`

Emit at most once per bottom-sheet opening. Re-renders and realtime room refreshes must not duplicate the event.

### `room_create_form_abandoned`

Emit when an opened create form is left without `room_create_started` because the sheet closes or the origin changes.

Properties:

- `from_location`
- `has_destination`
- `has_departure_time`
- `reason: sheet_closed | origin_changed`
- `source: map_bottom_sheet`

Do not emit after successful submission, validation that proceeds to `room_create_started`, or mere React re-renders. Do not send raw field values beyond the already approved location event properties.

## Amplitude Definitions

### Custom event

Create `[Activation] Room Activated` as the union of:

- `room_created`
- `room_joined`

Both underlying events must retain `environment = production` filtering in the saved funnel. `chat_room_opened` is not part of the custom event because it is a navigation/access event, not the activation outcome.

### Core activation funnel v2

Create a new chart and leave the existing chart unchanged for comparison.

```text
login_succeeded
→ profile_completed
→ map_opened(profile_completed=true)
→ fixed_point_selected
→ [Activation] Room Activated
→ chat_message_sent
```

- Ordered funnel
- Unique users
- Seven-day conversion window
- Asia/Seoul timezone
- Start date 2026-06-22
- `environment = production`
- Google login at the first step
- Exclude the four existing internal Supabase user IDs

### New-user profile funnel

```text
login_succeeded(profile_completed=false)
→ profile_setup_started
→ profile_completed
```

- Ordered funnel
- Unique users
- 24-hour conversion window
- Asia/Seoul timezone
- Start date 2026-06-22
- `environment = production`
- Google login at the first step
- Exclude the same four internal user IDs

This chart answers whether an incomplete user starts and finishes onboarding. It must not be used as a returning-user activation funnel.

## Implementation Boundaries

- Room inventory calculation lives in a small pure helper so event payloads and visible UI use the same joinability rules.
- `HomeClient` enriches `fixed_point_selected` because it owns the loaded room collection and loading state.
- `CampusRouteMap` owns empty-state exposure and create-form lifecycle because it owns the bottom sheet and draft fields.
- Existing `room_create_form_opened`, `room_create_started`, `room_created`, `room_join_started`, and `room_joined` contracts remain unchanged.
- Analytics failures must remain non-blocking and must never prevent room selection, creation, or navigation.

## Tests

1. A pure inventory test covers past rooms, full rooms, other origins, and joinable rooms.
2. An analytics contract test requires every new event and payload key.
3. A create-form lifecycle test verifies that abandonment is emitted once on close/origin change and not after submission.
4. The existing full test suite, lint, and production build run before handoff.
5. The saved Amplitude definitions are reopened and inspected after creation.

## Rollout and Success Check

- Merge and release the client events through the normal reviewed delivery path so new properties begin accumulating.
- Create the custom event and charts as part of the rollout; historical `room_created` and `room_joined` data should backfill the custom event.
- After seven complete days, compare:
  - empty-state exposure → create-form open
  - create-form open → create start
  - fixed-point selection with supply vs without supply → room activation
  - new profile setup start → profile completion

The first implementation is complete when code tests pass, the production build succeeds, and both Amplitude charts show valid non-error definitions with the expected filters.
