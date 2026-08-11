# 경로 구독 알림 · 참여 이력 보존 · 당일 방 유지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이용자가 관심 경로와 알림 시간대를 등록해두면 그 조건에 맞는 방이 열릴 때 알림을 받게 하여, 매칭에 필요한 "동시 접속" 요구를 제거한다.

**Architecture:** 기존 `favorites` 테이블에 알림 조건 컬럼을 추가해 경로 구독으로 재사용한다. 발송은 이미 검증된 `messages` 푸시 파이프라인(DB 트리거 → `pg_net` → `/api/push/dispatch` → web-push)을 그대로 복제해 `chat_rooms` insert에 붙인다. 별도로, 나갈 때 참여 기록이 삭제되어 매칭 이력이 소실되는 문제를 append-only 이력 테이블로 해결한다.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres + RLS + pg_net + vault), web-push, Resend, Tailwind CSS, `node --test`

## Global Constraints

- Supabase 프로젝트 ref: `hggpwrtasyngpjcbwjzg`. 모든 스키마 변경은 `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`로 추가하고 **`supabase_schema.sql`에도 동기화**한다.
- 테스트는 `npm test` (`node --test test/*.test.mjs`). 기존 테스트는 TS 소스를 `typescript`의 `transpileModule`로 변환해 실행하는 방식이다 — 이 패턴을 따른다.
- 시간대는 전부 **Asia/Seoul(KST)** 기준. `lib/supabase.ts:200`의 `formatLocalDate`는 브라우저 로컬 타임존을 쓰므로 **서버 코드에서 재사용 금지**.
- 터치 타깃 최소 40px, 핵심 버튼·아이콘에 접근 가능한 이름(`PRODUCT.md`).
- 상태를 색상만으로 구분하지 않는다 — 텍스트·아이콘·비활성 상태를 함께 쓴다(`PRODUCT.md`).
- 푸시 발송 실패가 방 생성을 막아서는 안 된다. 트리거는 예외를 삼키고 `raise warning`.
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `RESEND_REPLY_TO`는 로컬 `.env.local`에 **없다**(Vercel에만 존재). Task 13 실행 전 추가 필요.
- 관리자 계정 `ym5373@gachon.ac.kr` (`5a018580-6558-44fc-a621-1fa2506e9d5e`)는 모든 분석·발송 대상에서 제외.

---

## File Structure

**신규**

| 파일 | 책임 |
| --- | --- |
| `lib/routeAlerts.ts` | 알림 조건 판정 순수 함수(시간대·요일·심야). 서버/클라이언트 공용. DB·네트워크 의존 없음 |
| `app/routes/page.tsx` | 내 알림 경로 관리 화면 |
| `app/api/routes/route.ts` | 구독 목록 조회 / 생성 |
| `app/api/routes/[id]/route.ts` | 구독 수정 / 삭제 |
| `scripts/send-route-alert-email.mjs` | 일회성 기능 안내 메일 발송 |
| `lib/route-alert-email.ts` | 안내 메일 본문 생성 (`lib/welcome-email.ts` 패턴) |
| `test/route-alert-conditions.test.mjs` | 시간대·요일 판정 테스트 |
| `test/room-map-visibility.test.mjs` | 당일 방 노출 테스트 |
| `test/route-alert-email.test.mjs` | 안내 메일 본문 테스트 |

**수정**

| 파일 | 변경 |
| --- | --- |
| `lib/supabase.ts` | `isRoomVisibleOnMap` 로직 변경, `ROOM_MAP_VISIBILITY_WINDOW_MINUTES` 제거 |
| `app/api/push/dispatch/route.ts` | `room_id` 분기 추가 |
| `app/api/rooms/[id]/join/route.ts` | 참여 이력 기록 |
| `app/api/rooms/[id]/leave/route.ts` | 참여 이력 기록 + `closedAlone` 응답 |
| `components/CampusRouteMap.tsx` | FAB 추가, 지난 방 표시 |
| `components/HomeClient.tsx` | 방 생성 시 이력 기록, 구독 유도 프롬프트 |
| `lib/analytics/client.ts` 사용처 | 신규 이벤트 |

`lib/routeAlerts.ts`를 별도 파일로 두는 이유: 판정 로직이 서버(dispatch 라우트)와 클라이언트(`/routes` 미리보기) 양쪽에서 쓰이고, 순수 함수여야 테스트가 가능하다. `lib/supabase.ts`는 이미 크므로 더 늘리지 않는다.

---

## Task 1: 참여 이력 테이블

**Files:**
- Create: `supabase/migrations/20260806090000_add_room_participation_events.sql`
- Modify: `supabase_schema.sql`

**Interfaces:**
- Produces: `public.room_participation_events` 테이블 — `(id, room_id, user_id, joined_at, left_at)`, `unique(room_id, user_id)`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/20260806090000_add_room_participation_events.sql`:

```sql
-- 매칭 이력 보존용 append-only 테이블.
-- room_participants 는 나가기 시 행이 삭제되므로(app/api/rooms/[id]/leave/route.ts)
-- "누가 언제 참여했다 나갔는가"가 남지 않는다. 정원 체크와 메시지 RLS 가 모두
-- room_participants 를 참조하므로 그 테이블의 의미는 바꾸지 않고 별도로 기록한다.
create table if not exists public.room_participation_events (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  joined_at timestamp with time zone not null default timezone('utc'::text, now()),
  left_at timestamp with time zone,
  unique(room_id, user_id)
);

create index if not exists room_participation_events_room_idx
  on public.room_participation_events(room_id);
create index if not exists room_participation_events_user_idx
  on public.room_participation_events(user_id);

alter table public.room_participation_events enable row level security;

-- 관리자만 조회. 쓰기는 service_role 전용(정책 없음 = 일반 클라이언트 차단).
create policy "Admins can read participation events"
  on public.room_participation_events for select using (
    exists (
      select 1 from public.user_private_profiles p
      where p.user_id = auth.uid() and p.is_admin = true
    )
  );

-- 현재 활성 방의 참여자 백필. 닫힌 방은 이미 삭제되어 복구 불가.
insert into public.room_participation_events (room_id, user_id, joined_at)
select room_id, user_id, joined_at from public.room_participants
on conflict (room_id, user_id) do nothing;
```

- [ ] **Step 2: 마이그레이션 적용**

Supabase MCP 또는 SQL Editor로 프로젝트 `hggpwrtasyngpjcbwjzg`에 적용한다.

- [ ] **Step 3: 백필 결과 확인**

```sql
select count(*) from public.room_participation_events;
```

Expected: 현재 활성 방 참여자 수(약 49건)와 일치.

- [ ] **Step 4: `supabase_schema.sql` 동기화**

`favorites` 테이블 정의 뒤(현재 파일의 `create table public.push_subscriptions` 직전)에 위 `create table` + 인덱스 + RLS 정책을 추가한다. 백필 `insert`는 스키마 파일에 넣지 않는다(일회성).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260806090000_add_room_participation_events.sql supabase_schema.sql
git commit -m "feat(db): 참여 이력 보존 테이블 추가"
```

---

## Task 2: 참여 이력 기록

**Files:**
- Modify: `app/api/rooms/[id]/join/route.ts`
- Modify: `app/api/rooms/[id]/leave/route.ts:113-121`
- Modify: `components/HomeClient.tsx` (방 생성 성공 지점)

**Interfaces:**
- Consumes: Task 1의 `room_participation_events`
- Produces: 없음 (기록 부수효과만)

- [ ] **Step 1: join 라우트에 기록 추가**

`app/api/rooms/[id]/join/route.ts`에서 `room_participants` insert가 성공한 직후에 추가한다. 기록 실패가 참여를 막지 않도록 에러를 삼킨다 — `leave/route.ts:108`의 `ride_completions` 처리와 같은 방침.

```ts
// 매칭 이력 보존. 기록 실패가 참여 자체를 막지는 않는다.
const { error: historyError } = await admin
  .from('room_participation_events')
  .upsert(
    { room_id: roomId, user_id: user.id, joined_at: new Date().toISOString(), left_at: null },
    { onConflict: 'room_id,user_id' },
  )

if (historyError) {
  console.error('participation history record error:', historyError)
}
```

- [ ] **Step 2: leave 라우트에 기록 추가**

`app/api/rooms/[id]/leave/route.ts`의 `room_participants` 삭제 직후(현재 121행 `}` 다음, 123행 `if (currentParticipants.length <= 1)` 앞)에 추가한다.

```ts
// 나갔다는 사실을 이력에 남긴다. room_participants 행은 위에서 삭제되었다.
const { error: historyError } = await admin
  .from('room_participation_events')
  .update({ left_at: new Date().toISOString() })
  .eq('room_id', roomId)
  .eq('user_id', user.id)

if (historyError) {
  console.error('participation history leave error:', historyError)
}
```

- [ ] **Step 3: 방 생성 시 방장 이력 기록**

`components/HomeClient.tsx`의 방 생성 성공 경로에서, 방장이 `room_participants`에 추가된 뒤 이력도 남겨야 한다. 클라이언트는 `room_participation_events`에 쓸 권한이 없으므로(정책 없음), **join 라우트를 거치지 않는 생성 경로가 있는지 먼저 확인**한다.

```bash
grep -n "room_participants" components/HomeClient.tsx
```

두 경우로 나뉜다.

**(a) 이미 서버 라우트를 경유한다면** — Step 1의 코드가 그 지점을 커버하는지 확인하고, 다른 라우트라면 같은 코드를 그 라우트에도 추가한다.

**(b) 클라이언트가 직접 `room_participants`에 insert한다면** — 클라이언트는 `room_participation_events`에 쓸 권한이 없다(정책이 select만 있음). 방 생성 직후 기존 join 라우트를 호출해 이력을 남긴다.

```ts
// 방 생성 성공 후. 이력 기록 전용 호출이므로 실패해도 무시한다.
void fetch(`/api/rooms/${newRoomId}/join`, { method: 'POST' }).catch(() => {})
```

join 라우트가 이미 참여 중인 이용자에 대해 멱등인지 확인한다. 아니라면 `room_participation_events` upsert만 수행하는 최소 라우트 `app/api/rooms/[id]/history/route.ts`를 만들어 호출한다 — 참여자 정원 로직을 건드리지 않기 위해서다.

- [ ] **Step 4: 수동 확인**

개발 서버(`npm run dev`)에서 방 생성 → 다른 계정으로 입장 → 나가기를 수행하고 확인한다.

```sql
select room_id, user_id, joined_at, left_at
from public.room_participation_events
order by joined_at desc limit 5;
```

Expected: 생성자와 입장자 행이 각각 있고, 나간 쪽만 `left_at`이 채워져 있다.

- [ ] **Step 5: Commit**

```bash
git add app/api/rooms/ components/HomeClient.tsx
git commit -m "feat: 방 참여/이탈 이력 기록"
```

---

## Task 3: 당일 방 노출 로직

**Files:**
- Modify: `lib/supabase.ts:294-309`
- Test: `test/room-map-visibility.test.mjs`

**Interfaces:**
- Produces: `isRoomVisibleOnMap(departureDate: string, departureTime: string, now?: Date): boolean` — 시그니처 유지, 동작만 변경. `ROOM_MAP_VISIBILITY_WINDOW_MINUTES` 제거.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/room-map-visibility.test.mjs`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

function loadSupabaseExports() {
  const source = readFileSync(join(process.cwd(), 'lib/supabase.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })

  // test/location-points.test.mjs 의 로더와 동일한 패턴.
  const module = { exports: {} }
  const stubRequire = (specifier) => {
    if (specifier === '@supabase/ssr') {
      return { createBrowserClient: () => ({}) }
    }
    return {}
  }
  new Function('require', 'module', 'exports', outputText)(stubRequire, module, module.exports)
  return module.exports
}

// 2026-08-06(목) 14:00 KST 기준
const NOW = new Date('2026-08-06T14:00:00+09:00')

test('당일 방은 출발 시각이 지나도 계속 노출된다', () => {
  const { isRoomVisibleOnMap } = loadSupabaseExports()

  // 4시간 지난 방 — 기존 30분 창이면 숨겨졌을 것
  assert.equal(isRoomVisibleOnMap('2026-08-06', '10:00:00', NOW), true)
  // 방금 지난 방
  assert.equal(isRoomVisibleOnMap('2026-08-06', '13:59:00', NOW), true)
  // 새벽 방
  assert.equal(isRoomVisibleOnMap('2026-08-06', '00:12:00', NOW), true)
})

test('당일 미래 방과 내일 방은 계속 노출된다', () => {
  const { isRoomVisibleOnMap } = loadSupabaseExports()

  assert.equal(isRoomVisibleOnMap('2026-08-06', '18:00:00', NOW), true)
  assert.equal(isRoomVisibleOnMap('2026-08-07', '09:00:00', NOW), true)
})

test('지난 날짜 방은 노출되지 않는다', () => {
  const { isRoomVisibleOnMap } = loadSupabaseExports()

  assert.equal(isRoomVisibleOnMap('2026-08-05', '23:59:00', NOW), false)
})

test('입장 가능 여부는 출발 시각 기준을 유지한다', () => {
  const { isRoomJoinable } = loadSupabaseExports()

  // 노출은 되지만 입장은 불가
  assert.equal(isRoomJoinable('2026-08-06', '10:00:00', NOW), false)
  assert.equal(isRoomJoinable('2026-08-06', '18:00:00', NOW), true)
})

test('30분 노출 창 상수는 제거되었다', () => {
  const exports = loadSupabaseExports()
  assert.equal(exports.ROOM_MAP_VISIBILITY_WINDOW_MINUTES, undefined)
})
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `node --test test/room-map-visibility.test.mjs`
Expected: FAIL — 당일 지난 방 케이스에서 `true`가 아닌 `false`, 그리고 상수 제거 테스트 실패.

- [ ] **Step 3: 구현**

`lib/supabase.ts`에서 `ROOM_MAP_VISIBILITY_WINDOW_MINUTES` 상수(294행)를 삭제하고 `isRoomVisibleOnMap`(304-309행)을 교체한다.

```ts
export function isRoomVisibleOnMap(departureDate: string, departureTime: string, now = new Date()) {
  // 출발일이 오늘이면 출발 시각이 지났어도 계속 노출한다. 지난 방도 "오늘 이 지점에서
  // 사람들이 움직였다"는 신호이고, 방이 없는 시간대에 지도가 완전히 비어 보이는 것을 막는다.
  // 입장 가능 여부는 isRoomJoinable 이 따로 판정한다.
  if (departureDate === formatLocalDate(now)) return true

  return getRoomDepartureDateTime(departureDate, departureTime).getTime() >= now.getTime()
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/room-map-visibility.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: 잔여 참조 확인**

```bash
grep -rn "ROOM_MAP_VISIBILITY_WINDOW_MINUTES" app components lib test
```

Expected: 출력 없음. 남아 있으면 제거한다.

- [ ] **Step 6: 전체 테스트 + 빌드**

Run: `npm test && npm run build`
Expected: 모두 통과.

- [ ] **Step 7: Commit**

```bash
git add lib/supabase.ts test/room-map-visibility.test.mjs
git commit -m "feat: 당일 방은 출발 시각이 지나도 지도에 유지"
```

---

## Task 4: 지난 방 시각적 구분

**Files:**
- Modify: `components/CampusRouteMap.tsx` (하단 시트 방 목록 렌더링부)

**Interfaces:**
- Consumes: Task 3의 `isRoomJoinable`
- Produces: 없음 (UI만)

Task 3 이후 지난 방이 목록에 남지만 `isRoomJoinable`이 false라 입장 시 `past_departure` 에러(`components/HomeClient.tsx:1300`)를 만난다. 누르기 전에 상태가 보여야 한다.

- [ ] **Step 1: 방 목록 렌더링 지점 확인**

```bash
grep -n "onJoinRoom\|selectedOriginStat\|rooms.map" components/CampusRouteMap.tsx
```

하단 시트에서 방 카드를 그리는 위치를 찾는다.

- [ ] **Step 2: 지난 방 판정과 정렬 추가**

방 목록을 그리기 전에 분리하고, 지난 방을 뒤로 보낸다.

```tsx
const now = new Date()
const sortedRooms = [...originRooms].sort((a, b) => {
  const aPast = !isRoomJoinable(a.departure_date, a.departure_time, now)
  const bPast = !isRoomJoinable(b.departure_date, b.departure_time, now)
  if (aPast !== bPast) return aPast ? 1 : -1
  return a.departure_time.localeCompare(b.departure_time)
})
```

`isRoomJoinable`을 `@/lib/supabase`에서 import한다.

- [ ] **Step 3: 카드에 지난 방 표시**

각 카드에서 `const isPast = !isRoomJoinable(room.departure_date, room.departure_time, now)`를 계산하고:

- 컨테이너에 `isPast ? 'opacity-55' : ''` 추가
- 출발 시각 옆에 배지 삽입:

```tsx
{isPast && (
  <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-black text-gray-500">
    출발함
  </span>
)}
```

- 입장 버튼에 `disabled={isPast}` 추가, 라벨을 `isPast ? '출발한 방' : '입장하기'`로 전환. `disabled:` Tailwind 클래스로 비활성 스타일을 준다.

색상(흐림)만이 아니라 배지 텍스트와 `disabled` 상태를 함께 쓴다 — `PRODUCT.md` 접근성 원칙.

- [ ] **Step 4: 수동 확인**

`npm run dev`로 실행하고, 출발 시각이 이미 지난 방이 있는 지점을 선택한다.

Expected: 지난 방이 목록 하단에 흐리게 "출발함" 배지와 함께 표시되고, 입장 버튼이 비활성. 클릭해도 에러 토스트가 뜨지 않는다.

- [ ] **Step 5: 빌드**

Run: `npm run build`
Expected: 통과.

- [ ] **Step 6: Commit**

```bash
git add components/CampusRouteMap.tsx
git commit -m "feat: 지난 방을 흐림 처리하고 입장 비활성화"
```

---

## Task 5: 구독 조건 컬럼

**Files:**
- Create: `supabase/migrations/20260806091000_add_route_alert_settings.sql`
- Modify: `supabase_schema.sql`

**Interfaces:**
- Produces: `public.favorites`에 `notify_enabled boolean`, `notify_from time`, `notify_to time`, `notify_weekdays smallint[]`

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/20260806091000_add_route_alert_settings.sql`:

```sql
-- favorites 를 "경로 구독"으로 재사용한다. 0건이므로 마이그레이션 비용이 없다.
-- notify_from > notify_to 이면 자정을 넘는 구간으로 해석한다 (예: 22:00~02:00).
-- 둘 다 null 이면 종일.
alter table public.favorites
  add column if not exists notify_enabled boolean not null default true,
  add column if not exists notify_from time,
  add column if not exists notify_to time,
  add column if not exists notify_weekdays smallint[] not null default '{0,1,2,3,4,5,6}';

-- 0=일요일 … 6=토요일. 빈 배열은 "알림 없음"과 같으므로 금지한다.
alter table public.favorites
  add constraint favorites_notify_weekdays_valid check (
    array_length(notify_weekdays, 1) between 1 and 7
    and notify_weekdays <@ '{0,1,2,3,4,5,6}'::smallint[]
  );

-- 한쪽만 설정된 반쪽 구간을 막는다.
alter table public.favorites
  add constraint favorites_notify_window_paired check (
    (notify_from is null and notify_to is null)
    or (notify_from is not null and notify_to is not null)
  );

create index if not exists favorites_route_idx
  on public.favorites(from_location, to_location) where notify_enabled;
```

- [ ] **Step 2: 마이그레이션 적용 후 RLS 실동작 확인**

`favorites`는 0건이라 RLS가 한 번도 검증된 적이 없다. 정책이 `for all using (auth.uid() = user_id)`로 `with check`가 없으므로(`supabase_schema.sql:390`) insert가 실제로 통과하는지 확인해야 한다.

브라우저에서 로그인한 상태로 콘솔에서:

```js
const { data, error } = await window.__supabase
  .from('favorites')
  .insert({ from_location: '가천대역_1번출구', to_location: '제2기숙사' })
  .select()
console.log({ data, error })
```

Expected: `error`가 null이고 행이 생성된다. 실패하면 정책에 `with check (auth.uid() = user_id)`를 명시하는 마이그레이션을 추가한다.

확인 후 테스트 행을 삭제한다.

- [ ] **Step 3: `supabase_schema.sql` 동기화**

`favorites` 테이블 정의(123-131행)에 네 컬럼과 두 제약을 반영한다.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260806091000_add_route_alert_settings.sql supabase_schema.sql
git commit -m "feat(db): 경로 구독 알림 조건 컬럼 추가"
```

---

## Task 6: 알림 조건 판정 함수

**Files:**
- Create: `lib/routeAlerts.ts`
- Test: `test/route-alert-conditions.test.mjs`

**Interfaces:**
- Produces:
  - `isWithinNotifyWindow(departureTime: string, from: string | null, to: string | null): boolean`
  - `isNotifyWeekday(departureDate: string, weekdays: number[]): boolean`
  - `isQuietHourForAllDay(now: Date): boolean`
  - `shouldNotify(room: RoomForAlert, sub: RouteSubscription, now?: Date): boolean`
  - 타입 `RoomForAlert = { departure_date: string; departure_time: string }`
  - 타입 `RouteSubscription = { notify_enabled: boolean; notify_from: string | null; notify_to: string | null; notify_weekdays: number[] }`

이 태스크가 기능 전체에서 가장 틀리기 쉬운 부분이다. 자정 넘김과 KST 요일 계산을 반드시 테스트로 고정한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/route-alert-conditions.test.mjs`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

function loadRouteAlerts() {
  const source = readFileSync(join(process.cwd(), 'lib/routeAlerts.ts'), 'utf8')
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

test('일반 시간 구간은 경계를 포함한다', () => {
  const { isWithinNotifyWindow } = loadRouteAlerts()

  assert.equal(isWithinNotifyWindow('08:59:00', '09:00:00', '12:00:00'), false)
  assert.equal(isWithinNotifyWindow('09:00:00', '09:00:00', '12:00:00'), true)
  assert.equal(isWithinNotifyWindow('10:30:00', '09:00:00', '12:00:00'), true)
  assert.equal(isWithinNotifyWindow('12:00:00', '09:00:00', '12:00:00'), true)
  assert.equal(isWithinNotifyWindow('12:01:00', '09:00:00', '12:00:00'), false)
})

test('자정을 넘는 구간을 지원한다', () => {
  const { isWithinNotifyWindow } = loadRouteAlerts()

  // 22:00 ~ 02:00 — 심야 택시 시나리오
  assert.equal(isWithinNotifyWindow('22:00:00', '22:00:00', '02:00:00'), true)
  assert.equal(isWithinNotifyWindow('23:30:00', '22:00:00', '02:00:00'), true)
  assert.equal(isWithinNotifyWindow('00:30:00', '22:00:00', '02:00:00'), true)
  assert.equal(isWithinNotifyWindow('02:00:00', '22:00:00', '02:00:00'), true)
  assert.equal(isWithinNotifyWindow('03:00:00', '22:00:00', '02:00:00'), false)
  assert.equal(isWithinNotifyWindow('12:00:00', '22:00:00', '02:00:00'), false)
})

test('종일 구독은 모든 시각을 통과시킨다', () => {
  const { isWithinNotifyWindow } = loadRouteAlerts()

  assert.equal(isWithinNotifyWindow('03:00:00', null, null), true)
  assert.equal(isWithinNotifyWindow('14:00:00', null, null), true)
})

test('요일 판정은 KST 기준이다', () => {
  const { isNotifyWeekday } = loadRouteAlerts()

  // 2026-08-06 은 목요일(4)
  assert.equal(isNotifyWeekday('2026-08-06', [4]), true)
  assert.equal(isNotifyWeekday('2026-08-06', [1, 2, 3, 5]), false)
  // 평일 집합
  assert.equal(isNotifyWeekday('2026-08-06', [1, 2, 3, 4, 5]), true)
  // 2026-08-08 은 토요일(6)
  assert.equal(isNotifyWeekday('2026-08-08', [1, 2, 3, 4, 5]), false)
  assert.equal(isNotifyWeekday('2026-08-08', [0, 6]), true)
})

test('종일 구독은 새벽 02~06시에 발송을 보류한다', () => {
  const { isQuietHourForAllDay } = loadRouteAlerts()

  assert.equal(isQuietHourForAllDay(new Date('2026-08-06T01:59:00+09:00')), false)
  assert.equal(isQuietHourForAllDay(new Date('2026-08-06T02:00:00+09:00')), true)
  assert.equal(isQuietHourForAllDay(new Date('2026-08-06T05:59:00+09:00')), true)
  assert.equal(isQuietHourForAllDay(new Date('2026-08-06T06:00:00+09:00')), false)
  assert.equal(isQuietHourForAllDay(new Date('2026-08-06T23:00:00+09:00')), false)
})

test('shouldNotify 는 모든 조건을 결합한다', () => {
  const { shouldNotify } = loadRouteAlerts()

  const room = { departure_date: '2026-08-06', departure_time: '18:00:00' }  // 목요일
  const weekdayEvening = {
    notify_enabled: true,
    notify_from: '17:00:00',
    notify_to: '20:00:00',
    notify_weekdays: [1, 2, 3, 4, 5],
  }

  assert.equal(shouldNotify(room, weekdayEvening), true)

  // 알림 끔
  assert.equal(shouldNotify(room, { ...weekdayEvening, notify_enabled: false }), false)
  // 시간대 밖
  assert.equal(shouldNotify(room, { ...weekdayEvening, notify_from: '07:00:00', notify_to: '09:00:00' }), false)
  // 요일 밖
  assert.equal(shouldNotify(room, { ...weekdayEvening, notify_weekdays: [0, 6] }), false)
})

test('종일 구독은 새벽 방에 대해 심야 보류를 적용받는다', () => {
  const { shouldNotify } = loadRouteAlerts()

  const nightRoom = { departure_date: '2026-08-06', departure_time: '03:00:00' }
  const allDay = { notify_enabled: true, notify_from: null, notify_to: null, notify_weekdays: [0, 1, 2, 3, 4, 5, 6] }
  const explicit = { notify_enabled: true, notify_from: '02:00:00', notify_to: '05:00:00', notify_weekdays: [0, 1, 2, 3, 4, 5, 6] }

  const at3am = new Date('2026-08-06T03:00:00+09:00')

  // 종일 구독은 보류
  assert.equal(shouldNotify(nightRoom, allDay, at3am), false)
  // 명시적으로 새벽을 설정했다면 발송
  assert.equal(shouldNotify(nightRoom, explicit, at3am), true)
})
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `node --test test/route-alert-conditions.test.mjs`
Expected: FAIL — `lib/routeAlerts.ts` 파일이 없어 `ENOENT`.

- [ ] **Step 3: 구현**

`lib/routeAlerts.ts`:

```ts
// 경로 구독 알림의 발송 조건 판정. 순수 함수만 두어 서버(dispatch 라우트)와
// 클라이언트(/routes 미리보기) 양쪽에서 공유한다. DB·네트워크 의존 없음.

export type RoomForAlert = {
  departure_date: string   // 'YYYY-MM-DD'
  departure_time: string   // 'HH:MM:SS'
}

export type RouteSubscription = {
  notify_enabled: boolean
  notify_from: string | null
  notify_to: string | null
  notify_weekdays: number[]   // 0=일 … 6=토
}

// 종일 구독에 한해 적용하는 기본 조용 시간(KST). 아무 설정도 하지 않은 이용자를
// 새벽에 깨우지 않기 위한 안전장치이며, 명시적 시간대 설정은 이 규칙을 무시한다.
const QUIET_START_HOUR = 2
const QUIET_END_HOUR = 6

function toMinutes(time: string): number {
  const [hour, minute] = time.split(':')
  return Number(hour) * 60 + Number(minute)
}

export function isWithinNotifyWindow(
  departureTime: string,
  from: string | null,
  to: string | null,
): boolean {
  if (!from || !to) return true

  const target = toMinutes(departureTime)
  const start = toMinutes(from)
  const end = toMinutes(to)

  // from > to 이면 자정을 넘는 구간 (예: 22:00~02:00)
  if (start > end) return target >= start || target <= end

  return target >= start && target <= end
}

export function isNotifyWeekday(departureDate: string, weekdays: number[]): boolean {
  // 날짜 문자열을 KST 정오로 고정해 해석한다. 정오를 쓰면 어떤 런타임 타임존에서도
  // 날짜 경계를 넘지 않아 요일이 밀리지 않는다.
  const day = new Date(`${departureDate}T12:00:00+09:00`).getUTCDay()
  return weekdays.includes(day)
}

export function isQuietHourForAllDay(now: Date): boolean {
  // KST 시각을 런타임 타임존과 무관하게 계산한다.
  const kstHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      hour12: false,
    }).format(now),
  ) % 24

  return kstHour >= QUIET_START_HOUR && kstHour < QUIET_END_HOUR
}

export function shouldNotify(
  room: RoomForAlert,
  sub: RouteSubscription,
  now: Date = new Date(),
): boolean {
  if (!sub.notify_enabled) return false
  if (!isNotifyWeekday(room.departure_date, sub.notify_weekdays)) return false
  if (!isWithinNotifyWindow(room.departure_time, sub.notify_from, sub.notify_to)) return false

  const isAllDay = !sub.notify_from || !sub.notify_to
  if (isAllDay && isQuietHourForAllDay(now)) return false

  return true
}
```

`isNotifyWeekday`에서 KST 정오로 고정한 뒤 `getUTCDay()`를 쓰는 이유: `2026-08-06T12:00:00+09:00`은 UTC로 `03:00`이라 같은 날이고, 어떤 서버 타임존에서도 요일이 흔들리지 않는다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/route-alert-conditions.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/routeAlerts.ts test/route-alert-conditions.test.mjs
git commit -m "feat: 경로 알림 조건 판정 함수"
```

---

## Task 7: dispatch 라우트에 방 알림 분기

**Files:**
- Modify: `app/api/push/dispatch/route.ts:40-51, 129`

**Interfaces:**
- Consumes: Task 6의 `shouldNotify`, Task 5의 `favorites` 컬럼
- Produces: `POST /api/push/dispatch` 가 `{ room_id }` 본문을 수용

- [ ] **Step 1: 본문 파싱 분기**

40-51행의 `messageId` 파싱을 교체한다.

```ts
let messageId: string | undefined
let roomId: string | undefined
try {
  const body = await request.json()
  messageId = body?.message_id
  roomId = body?.room_id
} catch {
  return NextResponse.json({ error: 'bad request' }, { status: 400 })
}

if (!messageId && !roomId) {
  return NextResponse.json({ error: 'message_id or room_id required' }, { status: 400 })
}

const admin = createAdminSupabase()

if (roomId) {
  return dispatchRoomAlert(admin, roomId)
}
```

기존 `const admin = createAdminSupabase()`(52행)는 위로 올라갔으므로 중복 선언을 제거한다.

- [ ] **Step 2: 발송 헬퍼 추출**

기존 구독 발송/정리 로직(106-129행)이 두 분기에서 공유되도록 함수로 뺀다.

```ts
async function sendToSubscriptions(
  admin: ReturnType<typeof createAdminSupabase>,
  recipientIds: string[],
  payload: string,
) {
  if (recipientIds.length === 0) return { ok: true, sent: 0 }

  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', recipientIds)

  if (!subscriptions || subscriptions.length === 0) return { ok: true, sent: 0 }

  const staleEndpoints: string[] = []

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
      } catch (error) {
        const statusCode = (error as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(sub.endpoint)
        } else {
          console.error('web-push send failed:', statusCode, (error as { body?: string })?.body)
        }
      }
    }),
  )

  if (staleEndpoints.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }

  return { ok: true, sent: subscriptions.length - staleEndpoints.length }
}
```

기존 메시지 분기도 이 함수를 쓰도록 고친다.

- [ ] **Step 3: 방 알림 분기 구현**

```ts
async function dispatchRoomAlert(
  admin: ReturnType<typeof createAdminSupabase>,
  roomId: string,
) {
  const { data: room } = await admin
    .from('chat_rooms')
    .select('id, from_location, to_location, created_by, departure_date, departure_time')
    .eq('id', roomId)
    .maybeSingle()

  if (!room) {
    return NextResponse.json({ ok: true, skipped: 'room-not-found' })
  }

  const { data: subscriptions } = await admin
    .from('favorites')
    .select('user_id, notify_enabled, notify_from, notify_to, notify_weekdays')
    .eq('from_location', room.from_location)
    .eq('to_location', room.to_location)
    .eq('notify_enabled', true)

  const now = new Date()
  const recipientIds = (subscriptions ?? [])
    .filter((sub) => sub.user_id !== room.created_by)   // 방을 만든 본인은 제외
    .filter((sub) => shouldNotify(
      { departure_date: room.departure_date, departure_time: room.departure_time },
      sub,
      now,
    ))
    .map((sub) => sub.user_id)

  if (recipientIds.length === 0) {
    return NextResponse.json({ ok: true, recipients: 0 })
  }

  const payload = JSON.stringify({
    title: routeLabel(room.from_location, room.to_location),
    body: `${room.departure_time.slice(0, 5)} 출발 방이 열렸어요`,
    url: `/rooms/${room.id}`,
    roomId: room.id,
    tag: `route-${room.id}`,
  })

  const result = await sendToSubscriptions(admin, recipientIds, payload)
  return NextResponse.json(result)
}
```

상단에 import를 추가한다:

```ts
import { shouldNotify } from '@/lib/routeAlerts'
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 타입 에러 없이 통과.

- [ ] **Step 5: 로컬 호출 확인**

`npm run dev` 실행 후, `.env.local`의 `PUSH_DISPATCH_SECRET` 값을 써서 호출한다.

```bash
curl -s -X POST http://localhost:3000/api/push/dispatch \
  -H "Content-Type: application/json" \
  -H "x-push-secret: $(grep '^PUSH_DISPATCH_SECRET=' .env.local | cut -d= -f2-)" \
  -d '{"room_id":"00000000-0000-0000-0000-000000000000"}'
```

Expected: `{"ok":true,"skipped":"room-not-found"}`

시크릿 없이 호출하면 401인지도 확인한다.

- [ ] **Step 6: Commit**

```bash
git add app/api/push/dispatch/route.ts
git commit -m "feat: dispatch 라우트에 경로 알림 분기 추가"
```

---

## Task 8: 방 생성 트리거

**Files:**
- Create: `supabase/migrations/20260806092000_room_alert_notification.sql`
- Modify: `supabase_schema.sql`

**Interfaces:**
- Consumes: Task 7의 `/api/push/dispatch` `room_id` 분기

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/20260806092000_room_alert_notification.sql`:

```sql
-- 새 방이 생기면 그 경로를 구독한 이용자에게 푸시를 보낸다.
-- notify_new_message 와 동일한 구조(vault 시크릿 + pg_net). 발송 실패가 방 생성을
-- 막지 않도록 예외를 삼킨다.
create or replace function public.notify_new_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'push_dispatch_secret';

    if v_secret is not null then
      perform net.http_post(
        url := 'https://gatita.kro.kr/api/push/dispatch',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        body := jsonb_build_object('room_id', new.id)
      );
    end if;
  exception when others then
    raise warning 'room push dispatch notify failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists notify_new_room_trigger on public.chat_rooms;
create trigger notify_new_room_trigger
  after insert on public.chat_rooms
  for each row execute function public.notify_new_room();
```

- [ ] **Step 2: 적용 및 확인**

프로젝트 `hggpwrtasyngpjcbwjzg`에 적용한 뒤:

```sql
select tgname from pg_trigger where tgrelid = 'public.chat_rooms'::regclass;
```

Expected: `notify_new_room_trigger` 포함.

- [ ] **Step 3: `supabase_schema.sql` 동기화**

`notify_new_message` 함수/트리거(584-615행) 바로 뒤에 추가한다.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260806092000_room_alert_notification.sql supabase_schema.sql
git commit -m "feat(db): 방 생성 시 경로 구독자 알림 트리거"
```

---

## Task 9: 구독 API

**Files:**
- Create: `app/api/routes/route.ts`
- Create: `app/api/routes/[id]/route.ts`

**Interfaces:**
- Produces:
  - `GET /api/routes` → `{ routes: RouteSubscriptionRow[] }`
  - `POST /api/routes` body `{ from_location, to_location, notify_from?, notify_to?, notify_weekdays? }` → `{ route: RouteSubscriptionRow }`
  - `PATCH /api/routes/[id]` body `{ notify_enabled?, notify_from?, notify_to?, notify_weekdays? }` → `{ route: RouteSubscriptionRow }`
  - `DELETE /api/routes/[id]` → `{ ok: true }`
  - `RouteSubscriptionRow = { id, from_location, to_location, notify_enabled, notify_from, notify_to, notify_weekdays }`

- [ ] **Step 1: 목록/생성 라우트**

`app/api/routes/route.ts`. 기존 라우트(`app/api/rooms/[id]/join/route.ts`)의 인증 패턴과 `withAxiomRoute` 래핑을 따른다.

```ts
import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { isRestrictedRoutePair, LOCATIONS, type LocationType } from '@/lib/supabase'

const SELECT = 'id, from_location, to_location, notify_enabled, notify_from, notify_to, notify_weekdays'

async function listRoutes() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { data, error } = await supabase
    .from('favorites')
    .select(SELECT)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: '경로를 불러오지 못했습니다' }, { status: 500 })
  return NextResponse.json({ routes: data ?? [] })
}

async function createRoute(request: Request) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const from = body?.from_location as LocationType
  const to = body?.to_location as LocationType

  if (!from || !to || !(from in LOCATIONS) || !(to in LOCATIONS)) {
    return NextResponse.json({ error: '출발지와 도착지를 선택해주세요' }, { status: 400 })
  }
  if (from === to || isRestrictedRoutePair(from, to)) {
    return NextResponse.json({ error: '선택할 수 없는 경로입니다' }, { status: 400 })
  }

  const weekdays: number[] = Array.isArray(body?.notify_weekdays) && body.notify_weekdays.length > 0
    ? body.notify_weekdays
    : [0, 1, 2, 3, 4, 5, 6]

  const notifyFrom = body?.notify_from ?? null
  const notifyTo = body?.notify_to ?? null
  if ((notifyFrom === null) !== (notifyTo === null)) {
    return NextResponse.json({ error: '시작 시각과 종료 시각을 함께 설정해주세요' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('favorites')
    .upsert(
      {
        user_id: user.id,
        from_location: from,
        to_location: to,
        notify_enabled: true,
        notify_from: notifyFrom,
        notify_to: notifyTo,
        notify_weekdays: weekdays,
      },
      { onConflict: 'user_id,from_location,to_location' },
    )
    .select(SELECT)
    .single()

  if (error) return NextResponse.json({ error: '경로를 저장하지 못했습니다' }, { status: 500 })
  return NextResponse.json({ route: data })
}

export const GET = withAxiomRoute(listRoutes)
export const POST = withAxiomRoute(createRoute)
```

`createServerSupabase`의 정확한 export 이름은 먼저 확인한다:

```bash
grep -n "export" lib/supabase/server.ts
```

이름이 다르면 그에 맞춘다.

- [ ] **Step 2: 수정/삭제 라우트**

`app/api/routes/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createServerSupabase } from '@/lib/supabase/server'

const SELECT = 'id, from_location, to_location, notify_enabled, notify_from, notify_to, notify_weekdays'

async function updateRoute(request: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof body.notify_enabled === 'boolean') patch.notify_enabled = body.notify_enabled
  if ('notify_from' in body) patch.notify_from = body.notify_from ?? null
  if ('notify_to' in body) patch.notify_to = body.notify_to ?? null
  if (Array.isArray(body.notify_weekdays) && body.notify_weekdays.length > 0) {
    patch.notify_weekdays = body.notify_weekdays
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 내용이 없습니다' }, { status: 400 })
  }
  if (('notify_from' in patch) !== ('notify_to' in patch)) {
    return NextResponse.json({ error: '시작 시각과 종료 시각을 함께 설정해주세요' }, { status: 400 })
  }

  // RLS 가 auth.uid() = user_id 를 강제하므로 타인의 행은 수정되지 않는다.
  const { data, error } = await supabase
    .from('favorites')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select(SELECT)
    .maybeSingle()

  if (error) return NextResponse.json({ error: '경로를 수정하지 못했습니다' }, { status: 500 })
  if (!data) return NextResponse.json({ error: '경로를 찾을 수 없습니다' }, { status: 404 })
  return NextResponse.json({ route: data })
}

async function deleteRoute(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: '경로를 삭제하지 못했습니다' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const PATCH = withAxiomRoute(updateRoute)
export const DELETE = withAxiomRoute(deleteRoute)
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 통과.

- [ ] **Step 4: 수동 확인**

로그인 상태에서 브라우저 콘솔로:

```js
await (await fetch('/api/routes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from_location: '가천대역_1번출구',
    to_location: '제2기숙사',
    notify_from: '17:00:00',
    notify_to: '20:00:00',
    notify_weekdays: [1, 2, 3, 4, 5],
  }),
})).json()
```

Expected: `{ route: { id, ... } }`. 이어서 `GET /api/routes`가 그 행을 반환하는지 확인한다.

- [ ] **Step 5: Commit**

```bash
git add app/api/routes/
git commit -m "feat: 경로 구독 API"
```

---

## Task 10: `/routes` 화면

**Files:**
- Create: `app/routes/page.tsx`

**Interfaces:**
- Consumes: Task 9의 API, Task 6의 `shouldNotify`
- Produces: `/routes` 경로

- [ ] **Step 1: 화면 구현**

`'use client'` 컴포넌트. 기존 화면(`app/settings/page.tsx`)의 레이아웃·타이포 컨벤션을 따른다.

구성:

1. **헤더** — 뒤로가기 + "알림 경로"
2. **푸시 상태 배너** — `getNotificationPermission()`(`lib/push.ts`)이 `'granted'`가 아니면 안내. `isInstalled()`가 false면 "홈 화면에 추가해야 알림을 받을 수 있어요" + 설치 안내 시트 연결(Task 11)
3. **구독 목록** — 각 항목에 경로명, 시간대 요약(`17:00~20:00` 또는 `종일`), 요일 요약(`평일` / `매일` / `월·수·금`), 알림 토글, 삭제
4. **경로 추가 폼** — 출발지/도착지 셀렉트 + 시간대(종일 / 직접 설정) + 요일(매일 / 평일 / 주말 / 직접)
5. **"내 경로에 열린 방"** — 앱 내 폴백

출발지/도착지 선택지는 `LOCATIONS`를 쓰고, `isRestrictedRoutePair`로 불가 조합을 비활성화한다.

컴포넌트 뼈대:

```tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  LOCATIONS,
  getMapRoomDateRange,
  isRestrictedRoutePair,
  isRoomJoinable,
  type LocationType,
} from '@/lib/supabase'
import { getNotificationPermission } from '@/lib/push'
import { isInstalled } from '@/lib/pwa'
import { trackEvent } from '@/lib/analytics/client'
import { ArrowLeft, BellRing, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

type RouteSubscriptionRow = {
  id: string
  from_location: LocationType
  to_location: LocationType
  notify_enabled: boolean
  notify_from: string | null
  notify_to: string | null
  notify_weekdays: number[]
}

export default function RoutesPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [routes, setRoutes] = useState<RouteSubscriptionRow[]>([])
  const [openRooms, setOpenRooms] = useState<OpenRoom[]>([])
  const [loading, setLoading] = useState(true)

  const loadRoutes = useCallback(async () => {
    const res = await fetch('/api/routes')
    const json = await res.json()
    setRoutes(json.routes ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadRoutes() }, [loadRoutes])

  // … 폼 상태, 저장/삭제 핸들러, 폴백 조회(Step 2)
}
```

`isInstalled`의 정확한 export 위치를 먼저 확인한다:

```bash
grep -n "export" lib/pwa.ts
grep -n "export function trackEvent" lib/analytics/client.ts
```

요일 요약 헬퍼:

```tsx
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function summarizeWeekdays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  const key = sorted.join(',')
  if (key === '0,1,2,3,4,5,6') return '매일'
  if (key === '1,2,3,4,5') return '평일'
  if (key === '0,6') return '주말'
  return sorted.map((d) => WEEKDAY_LABELS[d]).join('·')
}

function summarizeWindow(from: string | null, to: string | null): string {
  if (!from || !to) return '종일'
  return `${from.slice(0, 5)}~${to.slice(0, 5)}`
}
```

- [ ] **Step 2: 앱 내 폴백 섹션**

구독 경로에 열린 방을 조회한다. 푸시가 닿는 이용자가 현재 10명뿐이므로 이 섹션이 사실상 주 경로다.

```tsx
// 구독한 경로들에 대해 오늘·내일 활성 방을 조회하고, 입장 가능한 것만 보여준다.
const { data } = await supabase
  .from('chat_rooms')
  .select('id, from_location, to_location, departure_date, departure_time, max_participants, participants:room_participants(id)')
  .in('departure_date', getMapRoomDateRange(new Date()))
  .eq('status', 'active')
  .order('departure_time', { ascending: true })

const myRouteKeys = new Set(routes.map((r) => `${r.from_location}>${r.to_location}`))
const openRooms = (data ?? []).filter((room) =>
  myRouteKeys.has(`${room.from_location}>${room.to_location}`)
  && isRoomJoinable(room.departure_date, room.departure_time),
)
```

각 방 카드는 탭 시 `/rooms/{id}`로 이동하고, `trackEvent('route_alert_opened', { room_id, from_location, to_location })`을 남긴다.

빈 상태 문구: "아직 열린 방이 없어요. 방이 열리면 여기에 표시돼요."

- [ ] **Step 3: 미확인 표시용 시각 저장**

폴백 섹션 진입 시 `localStorage.setItem('gatita:routes:seen_at', new Date().toISOString())`. 서버 상태를 추가하지 않는다.

- [ ] **Step 4: 빌드 및 수동 확인**

Run: `npm run build && npm run dev`

Expected: `/routes` 접근 시 구독 추가·수정·삭제가 동작하고, 시간대/요일 요약이 올바르게 표시된다.

- [ ] **Step 5: Commit**

```bash
git add app/routes/
git commit -m "feat: 알림 경로 관리 화면"
```

---

## Task 11: 지도 FAB

**Files:**
- Modify: `components/CampusRouteMap.tsx`
- Modify: `app/globals.css:1096` 부근

**Interfaces:**
- Consumes: Task 10의 `/routes`

- [ ] **Step 1: CSS 위치 규칙 추가**

`app/globals.css`에서 `.gatita-custom-zoom-control` 규칙(1096-1099행) 다음에 추가한다. 줌 컨트롤과 우측 정렬을 맞춘다.

```css
  .gatita-routes-fab {
    bottom: max(1rem, env(safe-area-inset-bottom));
    right: max(0.75rem, env(safe-area-inset-right));
    transition: opacity 150ms ease, transform 150ms ease;
  }

  .gatita-routes-fab--hidden {
    opacity: 0;
    transform: translateY(0.5rem);
    pointer-events: none;
  }
```

- [ ] **Step 2: FAB 렌더링**

`components/CampusRouteMap.tsx`의 줌 컨트롤 블록(470-490행) 다음에 추가한다. `isSheetOpen`(442행)일 때 숨긴다 — 하단 시트가 `inset-x-3`로 하단을 덮기 때문이다.

```tsx
{mapStatus === 'ready' && (
  <button
    type="button"
    aria-label={hasUnseenRouteRooms ? '알림 경로, 새로 열린 방 있음' : '알림 경로'}
    onClick={onOpenRoutes}
    className={`gatita-routes-fab absolute z-20 inline-flex h-14 w-14 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-800 shadow-[0_10px_28px_rgba(17,24,39,0.2)] transition hover:bg-gray-50${isSheetOpen ? ' gatita-routes-fab--hidden' : ''}`}
  >
    <BellRing className="h-6 w-6" />
    {hasUnseenRouteRooms && (
      <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
    )}
  </button>
)}
```

`BellRing`을 `lucide-react` import에 추가한다. 크기 56px로 40px 최소 터치 타깃(`PRODUCT.md`)을 만족한다.

- [ ] **Step 3: props 추가**

`CampusRouteMap`의 props 타입에 추가한다.

```ts
onOpenRoutes: () => void
hasUnseenRouteRooms?: boolean
```

`components/HomeClient.tsx`의 `<CampusRouteMap ... />` 호출부(1609행 부근)에 전달한다.

```tsx
onOpenRoutes={() => {
  if (requiresProfile) {
    openProfileRequiredModal('routes')
    return
  }
  router.push('/routes')
}}
hasUnseenRouteRooms={hasUnseenRouteRooms}
```

`hasUnseenRouteRooms`는 `HomeClient`에서 계산한다 — 구독 경로에 입장 가능한 방이 있고, 그 방의 `created_at`이 `localStorage`의 `gatita:routes:seen_at` 이후인 경우.

- [ ] **Step 4: 시트 충돌 수동 확인**

`npm run dev`에서 지도를 열고 지점을 선택한다.

Expected: 시트가 열리면 FAB이 페이드아웃되고, 닫으면 다시 나타난다. 시트와 겹쳐 보이는 순간이 없다.

- [ ] **Step 5: Commit**

```bash
git add components/CampusRouteMap.tsx components/HomeClient.tsx app/globals.css
git commit -m "feat: 지도 우하단 알림 경로 FAB"
```

---

## Task 12: 구독 유도 지점 · 분석 이벤트

**Files:**
- Modify: `app/api/rooms/[id]/leave/route.ts:123-130`
- Modify: `components/HomeClient.tsx`
- Modify: `components/CampusRouteMap.tsx`

**Interfaces:**
- Consumes: Task 9의 `POST /api/routes`

- [ ] **Step 1: leave 응답에 `closedAlone` 추가**

`app/api/rooms/[id]/leave/route.ts`의 방 닫기 분기를 교체한다. 43개 방이 겪은 순간이므로 가장 전환율이 높을 지점이다.

```ts
let closedAlone = false
if (currentParticipants.length <= 1) {
  await admin
    .from('chat_rooms')
    .update({ status: 'closed' })
    .eq('id', roomId)
  closedAlone = true
}

return NextResponse.json({
  ok: true,
  closedAlone,
  from_location: room.from_location,
  to_location: room.to_location,
})
```

`room` 조회 select에 `from_location, to_location`이 포함되는지 확인하고, 없으면 추가한다.

- [ ] **Step 2: 방 닫힘 프롬프트**

`components/HomeClient.tsx`(또는 나가기를 호출하는 채팅방 화면)에서 응답의 `closedAlone`이 true면 시트를 띄운다.

- 제목: "이 경로 알림을 받을까요?"
- 본문: "{출발지} → {도착지}에 방이 열리면 알려드릴게요."
- 확인 시 `POST /api/routes` 호출 후 토스트, 이후 `trackEvent('route_subscribed', { from_location, to_location, source: 'closed_alone', has_time_window: false, weekday_count: 7 })`
- 노출 시 `trackEvent('closed_alone_prompt_shown', { from_location, to_location })`

- [ ] **Step 3: 하단 시트 구독 버튼**

`components/CampusRouteMap.tsx`의 하단 시트에서 `selectedFrom`이 있을 때, 방 목록 아래에 "이 경로 알림 받기" 링크를 둔다. 도착지가 정해지지 않은 단계이므로 `/routes?from={selectedFrom}`로 이동시켜 도착지를 고르게 한다.

- [ ] **Step 4: 미설치자 홈 화면 추가 안내**

`/routes`에서 구독 생성이 성공했고 `isInstalled()`가 false면 기존 설치 안내 시트를 띄운다. **푸시 권한을 새로 묻지 않는다** — 병목은 프롬프트가 아니라 설치율이고, iOS는 홈 화면 추가 없이 웹 푸시가 불가능하다.

```ts
trackEvent('pwa_install_instruction_shown', { source: 'route_subscribe' })
```

- [ ] **Step 5: 나머지 이벤트 연결**

```
route_unsubscribed        { from_location, to_location }          // /routes 삭제
route_alert_fallback_seen { room_count }                          // 폴백 섹션 노출
past_room_viewed          { room_id }                             // 지난 방 카드 탭
```

`route_subscribed`의 `has_time_window`(시간대 설정 여부)와 `weekday_count`(선택 요일 수)를 반드시 채운다. 대부분이 종일로 두면 시간대 설계가 과잉이었다는 신호이고, 다수가 설정하면 초안의 제외 판단이 틀렸음이 확인된다.

- [ ] **Step 6: 전체 테스트 + 빌드**

Run: `npm test && npm run build`
Expected: 모두 통과.

- [ ] **Step 7: Commit**

```bash
git add app/api/rooms/ components/ app/routes/
git commit -m "feat: 경로 구독 유도 지점과 분석 이벤트"
```

---

## Task 13: 기능 안내 메일

**Files:**
- Create: `lib/route-alert-email.ts`
- Create: `scripts/send-route-alert-email.mjs`
- Test: `test/route-alert-email.test.mjs`

**Interfaces:**
- Produces: `createRouteAlertEmail(name: string): { subject: string; text: string; html: string }`

**이 태스크는 Task 1~12가 프로덕션에 배포·검증된 뒤에 실행한다.** 메일을 받고 들어온 이용자가 동작하지 않는 화면을 만나면 안 된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/route-alert-email.test.mjs`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

function loadEmailExports() {
  const source = readFileSync(join(process.cwd(), 'lib/route-alert-email.ts'), 'utf8')
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

test('안내 메일은 이름을 이스케이프한다', () => {
  const { createRouteAlertEmail } = loadEmailExports()
  const email = createRouteAlertEmail('<script>alert(1)</script>')

  assert.equal(email.html.includes('<script>'), false)
  assert.equal(email.html.includes('&lt;script&gt;'), true)
})

test('안내 메일은 경로 화면 CTA 와 수신거부 링크를 포함한다', () => {
  const { createRouteAlertEmail } = loadEmailExports()
  const email = createRouteAlertEmail('박영민')

  assert.match(email.html, /https:\/\/gatita\.kro\.kr\/routes/)
  assert.match(email.html, /utm_campaign=route_alerts/)
  assert.match(email.html, /수신거부|수신 거부/)
  assert.match(email.text, /https:\/\/gatita\.kro\.kr\/routes/)
})

test('이름이 비어도 기본 호칭을 쓴다', () => {
  const { createRouteAlertEmail } = loadEmailExports()
  const email = createRouteAlertEmail('   ')

  assert.match(email.html, /회원/)
})
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `node --test test/route-alert-email.test.mjs`
Expected: FAIL — `lib/route-alert-email.ts` 없음.

- [ ] **Step 3: 메일 본문 구현**

`lib/route-alert-email.ts`. `lib/welcome-email.ts`의 테이블 기반 HTML 구조와 `escapeHtml`을 그대로 따른다(이메일 클라이언트 호환성).

내용 요지:
- 경로를 등록해두면 그 경로에 방이 열릴 때 알려준다
- CTA: `https://gatita.kro.kr/routes?utm_source=feature_email&utm_medium=email&utm_campaign=route_alerts`
- 홈 화면 추가 안내를 함께 넣는다 — 푸시 도달 상한이 설치율에 걸려 있으므로 이 메일이 설치율을 올릴 기회다
- 하단에 수신거부 안내(회신으로 요청 가능하다는 문구 + `mailto:` 링크로 충분)

`RESEND_REPLY_TO` 주소를 수신거부 회신처로 쓴다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/route-alert-email.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: 발송 스크립트 구현**

`scripts/send-route-alert-email.mjs`. `scripts/preview-test-accounts.mjs`의 구조를 따른다.

```js
// 기능 안내 메일 일회성 발송.
//   node scripts/send-route-alert-email.mjs --dry-run
//   node scripts/send-route-alert-email.mjs
//
// Idempotency-Key 로 재실행 시 중복 발송이 차단된다.

const DRY_RUN = process.argv.includes('--dry-run')
const ADMIN_USER_ID = '5a018580-6558-44fc-a621-1fa2506e9d5e'
```

동작:

1. `user_private_profiles`에서 `status='active'`, `is_admin=false`, `email is not null` 조회. 온보딩 미완료자도 포함한다(84명 중 25명 — 이들에겐 복귀 유인이 된다).
2. `--dry-run`이면 대상자 수와 이메일 3건 샘플만 출력하고 종료.
3. 아니면 **순차 발송**. 각 요청에 `'Idempotency-Key': `gatita-route-alerts/${userId}``.
4. 개별 실패는 `console.error`로 남기고 다음 수신자로 계속한다. 전체를 중단하지 않는다.
5. 종료 시 성공/실패 건수 요약 출력.

`lib/route-alert-email.ts`는 TS이므로, 스크립트에서 쓰려면 `test/` 파일들과 같은 `transpileModule` 방식으로 로드하거나 본문 생성 로직을 `.mjs`로 옮긴다. 전자를 택한다 — 테스트와 발송이 같은 소스를 쓰게 된다.

- [ ] **Step 6: 환경변수 준비 후 dry-run**

`.env.local`에 Vercel의 값을 복사해 넣는다(현재 로컬에 없음).

```
RESEND_API_KEY=...
RESEND_FROM_EMAIL=...
RESEND_REPLY_TO=...
```

Run: `node scripts/send-route-alert-email.mjs --dry-run`
Expected: 대상자 수가 실유저 중 활성 계정 수와 일치(약 83명). 관리자 계정이 목록에 없어야 한다.

- [ ] **Step 7: 본인 계정으로 실발송 확인**

대상자를 본인 이메일 하나로 제한하는 임시 필터를 걸고 실행해 수신을 확인한다. 렌더링(모바일 Gmail/애플 메일), CTA 링크, 수신거부 문구를 눈으로 검증한다.

- [ ] **Step 8: 전체 발송**

Task 1~12가 프로덕션에 배포된 것을 확인한 뒤 실행한다.

Run: `node scripts/send-route-alert-email.mjs`

- [ ] **Step 9: Commit**

```bash
git add lib/route-alert-email.ts scripts/send-route-alert-email.mjs test/route-alert-email.test.mjs
git commit -m "feat: 경로 구독 기능 안내 메일"
```

---

## 최종 검증

- [ ] `npm test` 전체 통과
- [ ] `npm run build` 통과
- [ ] `npm run lint` 통과
- [ ] 경로 구독 → 다른 계정으로 그 경로에 방 생성 → 푸시 수신
- [ ] 구독 시간대 **밖의** 방을 만들었을 때 미수신
- [ ] 자정 넘김 구간(22:00~02:00) 구독 후 00:30 방 생성 → 수신
- [ ] 방 생성자 본인에게는 미발송
- [ ] 푸시 권한 거부 상태에서 `/routes` 폴백에 방이 뜬다
- [ ] 방 나가기 → `room_participation_events.left_at` 기록됨
- [ ] 지난 방이 시트 하단에 흐리게 "출발함" 배지와 함께 뜨고 입장 비활성
- [ ] 시트 열림/닫힘에 따라 FAB이 페이드아웃/인
- [ ] 안내 메일 `--dry-run` 대상자 수가 예상과 일치

## 측정 기준선

배포 후 비교할 46일치 기준선. 관리자 계정 제외.

| 지표 | 기준선 |
| --- | --- |
| 참여자 2명 이상 방 비율 | 2/37 (5.4%) |
| PWA 설치율 | 10/59 (17%) |
| 설치자 중 푸시 수락률 | 3/10 (30%) |
| 경로 구독자 수 | 0 |
