# Invite Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add room-level invite sharing so Gachon students can share a joinable room link without exposing chat, phone, or payout data.

**Architecture:** Keep sharing copy and URL construction in a small pure utility, then wire it into the chat room page. The room page will show a join CTA for signed-in non-participants and a share affordance for participants when the room is still open and not full. OAuth start will preserve `?invite=1` return paths so invited users come back to the room after login.

**Tech Stack:** Next.js 14 App Router, React client components, TypeScript, Supabase, Node `node:test`.

---

### Task 1: Invite Utility

**Files:**
- Create: `lib/roomInvite.ts`
- Test: `test/room-invite-sharing.test.mjs`

- [ ] **Step 1: Write the failing test**

Add this behavior test to `test/room-invite-sharing.test.mjs`:

```js
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function loadRoomInviteExports() {
  const source = readProjectFile('lib/roomInvite.ts')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })

  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(() => ({}), module, module.exports)
  return module.exports
}

test('room invite utility builds a private-safe share payload', () => {
  assert.equal(existsSync(join(process.cwd(), 'lib/roomInvite.ts')), true)
  const { buildRoomInviteUrl, buildRoomInviteSharePayload } = loadRoomInviteExports()

  const url = buildRoomInviteUrl('https://gatita.kro.kr/map', 'room-123')
  assert.equal(url, 'https://gatita.kro.kr/rooms/room-123?invite=1')

  const payload = buildRoomInviteSharePayload({
    origin: 'https://gatita.kro.kr',
    roomId: 'room-123',
    fromLabel: '가천대역 1번출구',
    toLabel: 'AI공학관',
    departureDate: '2026-06-22',
    departureTime: '18:30:00',
    participantCount: 2,
    maxParticipants: 4,
  })

  assert.equal(payload.title, '같이타 초대')
  assert.equal(payload.url, 'https://gatita.kro.kr/rooms/room-123?invite=1')
  assert.match(payload.text, /\[같이타\] 6월 22일 18:30/)
  assert.match(payload.text, /가천대역 1번출구 → AI공학관 같이 갈 사람\?/)
  assert.match(payload.text, /현재 2\/4명 참여 중/)
  assert.doesNotMatch(payload.text, /전화|계좌|채팅/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/room-invite-sharing.test.mjs`

Expected: FAIL because `lib/roomInvite.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `lib/roomInvite.ts` with:

```ts
type RoomInvitePayloadInput = {
  origin: string
  roomId: string
  fromLabel: string
  toLabel: string
  departureDate: string
  departureTime: string
  participantCount: number
  maxParticipants: number
}

function formatInviteDateTime(departureDate: string, departureTime: string) {
  const [year, month, day] = departureDate.split('-').map(Number)
  const time = departureTime.slice(0, 5)

  if (!Number.isFinite(month) || !Number.isFinite(day)) {
    return time
  }

  return `${month}월 ${day}일 ${time}`
}

export function buildRoomInviteUrl(origin: string, roomId: string) {
  const url = new URL(`/rooms/${roomId}`, origin)
  url.searchParams.set('invite', '1')
  return url.toString()
}

export function buildRoomInviteSharePayload(input: RoomInvitePayloadInput) {
  const url = buildRoomInviteUrl(input.origin, input.roomId)
  const dateTime = formatInviteDateTime(input.departureDate, input.departureTime)

  return {
    title: '같이타 초대',
    text: [
      `[같이타] ${dateTime}`,
      `${input.fromLabel} → ${input.toLabel} 같이 갈 사람?`,
      `현재 ${input.participantCount}/${input.maxParticipants}명 참여 중`,
      `가천대 계정으로 바로 입장하기: ${url}`,
    ].join('\n'),
    url,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/room-invite-sharing.test.mjs`

Expected: PASS.

### Task 2: Chat Room Invite UX

**Files:**
- Modify: `app/rooms/[id]/page.tsx`
- Test: `test/room-invite-sharing.test.mjs`

- [ ] **Step 1: Write the failing source-structure tests**

Append tests to `test/room-invite-sharing.test.mjs`:

```js
test('chat room exposes invite sharing from the participant sheet only for joinable rooms', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /Share2/)
  assert.match(source, /buildRoomInviteSharePayload/)
  assert.match(source, /const isRoomInviteAvailable =/)
  assert.match(source, /handleShareRoomInvite/)
  assert.match(source, /navigator\.share/)
  assert.match(source, /navigator\.clipboard\.writeText\(sharePayload\.text\)/)
  assert.match(source, /초대 링크 공유/)
  assert.match(source, /방이 마감되면 초대할 수 없어요/)
  assert.doesNotMatch(source, /방 만들고 공유/)
})

test('invited non-participants can join from the room page without seeing private room data', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /useSearchParams/)
  assert.match(source, /const isInviteEntry = searchParams\.get\('invite'\) === '1'/)
  assert.match(source, /handleJoinInvitedRoom/)
  assert.match(source, /source: 'room_invite'/)
  assert.match(source, /초대받은 방/)
  assert.match(source, /참여하고 채팅 보기/)
  assert.match(source, /이 방은 마감됐어요/)
  assert.match(source, /\{isParticipant \? \(/)
  assert.match(source, /채팅방에 참여하면 메시지를 볼 수 있습니다/)
  assert.doesNotMatch(source, /\{creatorPayoutAccount \? \([\s\S]*\) : \(/, 'payout panel should not render for non-participants')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/room-invite-sharing.test.mjs`

Expected: FAIL because the chat room page has no invite UI or join handler.

- [ ] **Step 3: Write minimal implementation**

In `app/rooms/[id]/page.tsx`:

- Import `useSearchParams` from `next/navigation`.
- Import `Share2` from `lucide-react`.
- Import `isRoomJoinable` from `@/lib/supabase`.
- Import `buildRoomInviteSharePayload` from `@/lib/roomInvite`.
- Add state `isJoiningInvitedRoom`.
- Add `const isInviteEntry = searchParams.get('invite') === '1'`.
- Add `const isRoomInviteAvailable = room ? isRoomJoinable(room.departure_date, room.departure_time) && participants.length < room.max_participants : false`.
- Add `handleShareRoomInvite` that uses Web Share API when available and falls back to copying the generated text.
- Add `handleJoinInvitedRoom` that posts to `/api/rooms/${roomId}/join`, tracks `room_join_started`, `room_joined`, `room_join_failed` with `source: 'room_invite'`, reloads room state, and marks the user as participant.
- Hide the payout panel and message history for non-participants.
- Render a non-participant invite panel with room route, time, capacity, and CTA.
- Add `초대 링크 공유` button inside the participant sheet only when `isRoomInviteAvailable`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/room-invite-sharing.test.mjs`

Expected: PASS.

### Task 3: Preserve Invite Redirect Through Login

**Files:**
- Modify: `lib/auth.ts`
- Modify: `app/page.tsx`
- Modify: `app/auth/callback/route.ts`
- Test: `test/room-invite-sharing.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append tests to `test/room-invite-sharing.test.mjs`:

```js
test('OAuth start preserves a room invite return path', () => {
  const auth = readProjectFile('lib/auth.ts')
  const page = readProjectFile('app/page.tsx')
  const callback = readProjectFile('app/auth/callback/route.ts')

  assert.match(auth, /getGoogleOAuthOptions\(redirectPath\?: string\)/)
  assert.match(auth, /redirectTo: `\$\{window\.location\.origin\}\/auth\/callback\$\{callbackSearch\}`/)
  assert.match(page, /const inviteRedirectPath = pathname\.startsWith\('\/rooms\/'\)/)
  assert.match(page, /getGoogleOAuthOptions\(inviteRedirectPath\)/)
  assert.match(callback, /const redirectPath = requestUrl\.searchParams\.get\('redirect'\)/)
  assert.match(callback, /redirectToHome\(origin, \{ auth: 'complete' \}, redirectPath\)/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/room-invite-sharing.test.mjs`

Expected: FAIL because OAuth does not preserve a room invite redirect.

- [ ] **Step 3: Write minimal implementation**

In `lib/auth.ts`, let `getGoogleOAuthOptions` accept an optional `redirectPath` and append it to the callback URL as `?redirect=...` only for same-origin paths.

In `app/page.tsx`, compute:

```ts
const inviteRedirectPath = pathname.startsWith('/rooms/')
  ? `${pathname}${typeof window !== 'undefined' ? window.location.search : ''}`
  : undefined
```

Then pass it to `getGoogleOAuthOptions(inviteRedirectPath)`.

In `app/auth/callback/route.ts`, update `redirectToHome` to accept an optional path, reject external URLs, and redirect to that safe path with `auth=complete`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/room-invite-sharing.test.mjs`

Expected: PASS.

### Task 4: Verification

**Files:**
- All touched files.

- [ ] **Step 1: Run focused invite tests**

Run: `node --test test/room-invite-sharing.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: build completes successfully.
