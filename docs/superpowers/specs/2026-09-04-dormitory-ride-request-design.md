# Dormitory Ride Request Design

**Date:** 2026-09-04

**Status:** Awaiting product review

**Scope:** Optional dormitory profile signal, empty-supply ride request UI, and dormitory-targeted PWA push delivery

## Goal

Help users create the first useful room when supply is empty by making the likely dormitory route feel actionable. A request creates a normal room, then notifies eligible Gatita users who identified themselves as dormitory residents.

This feature must not make dormitory status a requirement for completing a profile and must not promise that another user will join.

## Product Decisions

### Optional profile question

Show an optional card in the existing final profile review step. It is not a new blocking onboarding step and it is not part of the profile-completion requirement.

- Main copy: `기숙사생이신가요?`
- Supporting copy: `같이타에 가입한 다른 기숙사생들과 동행 요청을 주고 받을 수 있어요`
- Answers: `네` and `아니요`
- The user may complete the profile without answering.
- `네` stores that the user is a dormitory resident and opts them into app-level dormitory ride-request push notifications.
- `아니요` stores that the user is not a dormitory resident and is not eligible for those notifications.
- No answer remains distinct from `아니요` so the question can be shown again in settings without inventing a negative answer.

Selecting `네` does not trigger the browser or operating-system notification permission prompt during onboarding. Actual delivery still requires an installed PWA, a valid push subscription, and the existing global `push_enabled` setting. The dormitory answer records product-level consent and eligibility; the platform permission is requested through the existing PWA flow.

The same value can be changed later in settings. Changing to `아니요` immediately removes the user from dormitory request fanout without disabling unrelated route notifications.

### Empty-supply banner

Show a compact `혹시 기숙사 가시나요?` banner only in these cases:

1. Origin `가천대역_1번출구` or `가천대학교_정문`: there is no joinable room from that origin to `제2기숙사`.
2. Origin `제2기숙사`: there is no joinable room from Dormitory 2 to any destination.

A room is joinable only when its departure time has not passed and it has remaining participant capacity. Past and full rooms do not suppress the banner.

For station or main-gate origins, the request destination is fixed to `제2기숙사`. For `제2기숙사` as origin, the user selects any destination allowed by the existing global route rules. There is no dormitory-specific destination restriction.

### Ride request sheet

Clicking the banner opens a small request sheet. It uses this exact promise copy:

`다른 기숙사생들에게 동행 요청을 보내드릴게요`

Do not use copy that narrows the audience to users who have already enabled notifications. The sheet explains delivery limitations separately only where the current PWA permission UI already does so.

The user chooses:

- Departure time.
- Destination only when the origin is `제2기숙사`.
- `요청하기` or `취소`.

Submitting creates a real chat room with the requester as its creator and first participant. The room appears in the same room list and follows the same capacity, duplicate-route, departure-time, and participant rules as a manually created room.

If the normal duplicate-room check finds an equivalent joinable room, do not create a second room. Reuse the existing duplicate-room guidance and lead the user to the available room.

## Data Model

### Private user profile

Add a nullable boolean to `user_private_profiles`:

```sql
is_dormitory_resident boolean null
```

Meaning:

- `true`: resident and opted into dormitory ride-request notifications.
- `false`: explicitly not a resident and not opted in.
- `null`: not answered.

The field remains in the private profile table. Existing row-level security continues to allow an authenticated user to read and write only their own profile, while service-role notification code may read eligible recipients. It must not be exposed through public profiles or room participant payloads.

### Room creation source

Add a source discriminator to `chat_rooms`:

```sql
creation_source text not null default 'standard'
  check (creation_source in ('standard', 'dormitory_request'))
```

Existing and ordinary rooms remain `standard`. Only rooms submitted from the dormitory request sheet use `dormitory_request`. This prevents all manually created rooms from triggering broad dormitory fanout.

Generated Supabase types and local structural types must include both new columns.

## API and State Flow

1. Profile load returns `is_dormitory_resident` from the authenticated user's private profile.
2. Profile completion accepts the nullable value but never validates it as required.
3. Settings exposes the same value and persists changes through an authenticated server route.
4. The map derives route-specific joinable inventory from the shared room-inventory helper.
5. A valid request calls the existing room-creation path with `creation_source: 'dormitory_request'`.
6. The existing database webhook invokes the protected push-dispatch route with the created room ID.
7. The dispatcher loads the room source. For `dormitory_request`, it builds and deduplicates recipients from:
   - Existing exact-route subscribers who pass normal notification preferences.
   - Other users whose private profile has `is_dormitory_resident = true`, whose global push setting is enabled, and who have a valid push subscription.
8. The room creator is always excluded from recipient fanout.

Push delivery failure does not roll back a successfully created room. The API logs and reports notification counts through the existing dispatch response while avoiding personal data in logs.

## Analytics

Add production events with only the properties needed to diagnose the flow:

- `dormitory_profile_answered`: `is_dormitory_resident`, `source` (`onboarding` or `settings`).
- `dormitory_request_banner_viewed`: `from_location`, `destination_mode`, `joinable_room_count: 0`.
- `dormitory_request_banner_clicked`: `from_location`, `destination_mode`.
- `dormitory_request_cancelled`: `from_location`, `has_destination`, `has_departure_time`.
- `dormitory_request_submitted`: `from_location`, `to_location`, `departure_lead_minutes`.
- `dormitory_request_failed`: `from_location`, `failure_stage`, `reason_code`.

The existing `room_created` event gains `creation_source`. Do not create a separate `route_subscribe` funnel. The primary evaluation is banner view to request submission, followed by room join and first message outcomes.

## Privacy and Consent

- Dormitory residency is a private preference used only for this coordination feature.
- The privacy policy must state that the service stores the optional dormitory-resident signal and uses it to select recipients for ride-request notifications.
- The UI must make `네` reversible in settings.
- The service must not expose a list of dormitory residents to clients.
- The copy must not claim guaranteed notification delivery or guaranteed participation.

## Error Handling

- Reject invalid origins, destinations, past departure times, and unsupported `creation_source` values on the server or database boundary.
- Keep the sheet open with the user's choices after a recoverable create error.
- If auth expires, route through the existing login recovery path and do not emit a successful submission event.
- If the room is created but notification dispatch fails, show room-creation success. Notification retry remains an operational concern, not a client transaction.
- If no recipient has a deliverable push subscription, the room still exists and remains discoverable in the map.

## Test Coverage

Automated tests must cover:

- Profile completion remains valid when the dormitory answer is `null`.
- `네`, `아니요`, and unanswered values persist without leaking into public-profile responses.
- Station and main-gate banners depend on route-specific Dormitory 2 inventory.
- Dormitory 2 banners depend on origin-wide inventory and allow every destination permitted by current global rules.
- Past and full rooms do not hide the banner; a joinable relevant room does.
- Request creation records `dormitory_request`, creates the participant row, and reuses duplicate handling.
- Dormitory fanout includes only opted-in residents with global push delivery enabled, excludes the creator, and deduplicates exact-route subscribers.
- Standard room creation preserves existing notification behavior.
- Analytics fire once per meaningful exposure/action and do not include private profile fields beyond the explicit boolean answer event.

The final gate is the full test suite, lint, production build, migration lint/diff where available, and manual mobile-width verification of onboarding, settings, both banner conditions, request/cancel, room creation, and push eligibility.

## Rollout

Ship behind a small feature flag or server-configured allowlist for the three origins first. Monitor request creation, duplicate prevention, push errors, joins, and first messages. Expand only after confirming the banner is not noisy and that broad dormitory notifications do not produce opt-outs.

## Out of Scope

- Making dormitory status required for profile completion.
- Limiting destinations when departing from Dormitory 2 beyond the existing global route rules.
- A separate route-subscription analysis funnel.
- Background auto-matching or guaranteed companions.
- Exposing dormitory residents or their notification state to other users.
