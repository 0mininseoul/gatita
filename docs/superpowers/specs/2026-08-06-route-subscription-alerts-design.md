# 경로 구독 알림 · 참여 이력 보존 — 설계

작성일: 2026-08-06

## 배경 / 문제

같이타는 2026-06-22 ~ 2026-08-06(46일) 운영됐다. 프로덕션 DB(`hggpwrtasyngpjcbwjzg`)
집계 결과는 다음과 같다. **관리자 계정(`ym5373@gachon.ac.kr`, `5a018580-…`)은 의도적
테스트로 방을 다수 생성했으므로 아래 숫자에서 모두 제외했다.**

| 지표 | 값 |
| --- | --- |
| 실유저 | 84명 (온보딩 완료 59명) |
| 방을 만들어 본 유저 | 22명 (온보딩 완료자의 37%) |
| 생성된 방 | 37개 |
| 참여자 2명 이상인 방 | 2개 |
| 서로 다른 사람이 메시지를 주고받은 방 | 2개 |
| `favorites` | 0건 |
| `push_subscriptions` | 5건 (84명 중 6%) |
| `ride_completions` | 0건 |

핵심 진단: **생성은 되는데 매칭이 안 된다.** 활성화율(37%)과 재시도율(방을 만든 22명
중 9명이 재생성, 그중 7명은 동일 경로 반복)은 오히려 건강하다. 실패하는 단계는
"그 방이 존재하는 순간에 같은 경로를 원하는 다른 사람이 지도를 보고 있을 것" 하나뿐이다.

그리고 실제로 엇갈린 기록이 남아 있다.

```
06/26  가천대역_1번출구 → 제2기숙사   17:00 방  vs  17:10 방   (10분 차, 서로 다른 두 사람)
07/22  AI공학관 → 가천대역_1번출구     00:12 방  vs  01:00 방   (48분 차)
```

같은 날 같은 경로에 서로 다른 사람이 방을 연 날이 4일 있었고, 모두 매칭에 실패했다.
서로의 존재를 몰랐을 뿐이다.

수요는 집중돼 있다. 실유저 방 37개가 **7개 경로**에만 분포하고 상위 3개가 70.3%다.
`가천대역_1번출구 ↔ 제2기숙사` 축 하나가 18건(48.6%)이다. 경로가 파편화돼 있지 않으므로
경로 단위 구독 모델이 성립한다.

한편 이 실패를 측정할 데이터가 스스로 지워지고 있다. `POST /api/rooms/[id]/leave`가
나가는 사람의 `room_participants` 행을 삭제하고(`route.ts:113`), 마지막 한 명이 나가면
`status='closed'`가 된다(`:123`). 결과적으로 닫힌 방 20개는 예외 없이 참여자 0명이고,
"실제로 누가 누구와 만났는가"의 이력이 남지 않는다.

## 목표

1. **경로 구독 알림.** 이용자가 평소에 관심 경로를 등록해 두면, 그 경로에 방이 열릴 때
   푸시를 받는다. 앱을 열고 있지 않아도 매칭이 성립하게 하여 **동시 접속 요구를 제거**한다.
2. **푸시 권한 수락률 개선.** 현재 6%. 권한 요청 시점을 "왜 필요한지가 자명한 순간"
   (경로 구독)으로 옮긴다.
3. **참여 이력 보존.** 방을 나가거나 닫아도 "누가 언제 참여했다 언제 나갔다"가 남는다.
   1번의 효과를 측정할 근거를 확보한다.
4. **지도 우하단 진입점(FAB).** 내 알림 경로 관리 화면으로 연결한다.

### 비목표

- 커뮤니티/게시판 기능. 별도 검토에서 현 규모(84명)에는 시기상조로 판단됐다. 하루 1~3건
  나오는 피드는 습관을 만들지 못하고, 유저 수를 늘리려 커뮤니티를 넣는 것은 순환 논리다.
  DAU 100~150 이후 재검토한다.
- 구독 경로의 시간대 필터. 전체 방 생성량이 하루 0.8개라 필터링할 물량이 아니다
  (최다 경로를 구독해도 이틀에 한 번꼴). 알림 피로가 관측되면 그때 추가한다.
- 정기 통학 시간표 자동 매칭. 구독 알림으로 얻는 데이터를 본 뒤 판단한다.
- 고아 페이지 `app/rooms/page.tsx` 정리. 이번 범위 밖이며 별도로 다룬다.

---

## 1. 참여 이력 보존

### 접근

`room_participants`를 소프트 삭제로 바꾸는 방법은 채택하지 않는다. 이 테이블은 정원
체크(최대 4명), 메시지 접근 RLS(`"Room participants can read messages"`), 참여자 목록
UI가 모두 참조하므로 의미를 바꾸면 파급이 크다. **추가만 하는 이력 테이블**을 둔다.

### 데이터 모델

```sql
create table public.room_participation_events (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  joined_at timestamp with time zone not null default timezone('utc'::text, now()),
  left_at timestamp with time zone,
  unique(room_id, user_id)
);

create index room_participation_events_room_idx on public.room_participation_events(room_id);
create index room_participation_events_user_idx on public.room_participation_events(user_id);
```

- `unique(room_id, user_id)`: 재입장은 기존 행의 `left_at`을 `null`로 되돌린다(upsert).
  "몇 번 들락거렸나"가 아니라 "참여한 적이 있나"를 측정하는 것이 목적이므로 충분하다.
- RLS: 관리자만 조회 가능(`user_private_profiles.is_admin`). 일반 이용자에게 노출하지
  않는다. 쓰기는 서버(service_role)만.

### 기록 지점

| 위치 | 동작 |
| --- | --- |
| `app/api/rooms/[id]/join/route.ts` | 참여 성공 후 upsert (`joined_at=now()`, `left_at=null`) |
| `app/api/rooms/[id]/leave/route.ts` | `room_participants` 삭제 직후 `left_at=now()` update |
| 방 생성 (방장 자동 참여) | 생성 성공 후 upsert |

기록 실패가 참여/나가기 자체를 막아서는 안 된다. `ride_completions` 기록과 동일하게
실패 시 `console.error`만 남기고 진행한다(`leave/route.ts:108` 패턴).

### 마이그레이션

기존 66개 방의 이력은 복구 불가능하다(이미 삭제됨). 현재 활성 방 46개의 참여자는
백필한다.

```sql
insert into public.room_participation_events (room_id, user_id, joined_at)
select room_id, user_id, joined_at from public.room_participants
on conflict (room_id, user_id) do nothing;
```

닫힌 방 20개는 이력 없음으로 남는다. 이는 스펙상 알려진 손실이며, 이후 측정은 이 시점을
기준선으로 삼는다.

---

## 2. 경로 구독 알림

### 데이터 모델 — `favorites` 확장

`favorites`는 이미 `(user_id, from_location, to_location, unique(user_id, from_location,
to_location))`로 필요한 모양을 갖췄다. **0건이므로 마이그레이션 비용이 없다.** 코드
참조도 `app/rooms/page.tsx:136` 한 곳뿐인데 그 페이지는 진입 경로가 없는 고아 페이지다.

```sql
alter table public.favorites
  add column notify_enabled boolean not null default true;
```

테이블명은 `favorites`를 유지한다. 이름이 의미와 어긋나지만, 개명은 RLS 정책
(`"Users can manage own favorites"`)과 기존 참조를 함께 손대야 하는 데 비해 얻는 게
없다. 코드·UI 상의 명칭은 "알림 경로"로 통일한다.

**RLS 확인 필요.** 기존 정책은 `for all using (auth.uid() = user_id)`로 `with check`가
없다(`supabase_schema.sql:390`). Postgres는 `with check`가 생략되면 `using` 식을 삽입
검증에도 사용하므로 동작상 문제는 없으나, 이 테이블은 0건이라 **한 번도 실제로 검증된 적이
없다.** 구현 시 insert/update/delete가 실제로 통과하는지 먼저 확인한다.

### 발송 파이프라인

기존 메시지 푸시와 **동일한 구조를 복제**한다. 검증된 경로다.

```
chat_rooms insert 트리거(notify_new_room) → pg_net → /api/push/dispatch → web-push
```

#### DB 트리거

`supabase_schema.sql:584`의 `notify_new_message`와 같은 형태로 작성한다. vault에서
`push_dispatch_secret`을 읽고, 실패해도 방 생성을 막지 않도록 예외를 삼킨다.

```sql
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

create trigger notify_new_room_trigger
  after insert on public.chat_rooms
  for each row execute function public.notify_new_room();
```

#### `/api/push/dispatch` 확장

현재 `message_id`만 받는다(`route.ts:43`). `room_id`도 받도록 분기한다. 시크릿 검증,
VAPID 설정, 만료 구독 정리(404/410) 로직은 그대로 공유한다.

```
body: { message_id }  → 기존 메시지 알림 (변경 없음)
body: { room_id }     → 신규 경로 알림
```

`room_id` 분기 처리 순서:

1. `chat_rooms`에서 `from_location`, `to_location`, `created_by`, `departure_time` 조회.
   없으면 `{ ok: true, skipped: 'room-not-found' }`.
2. **심야 보류**: 현재 시각(Asia/Seoul)이 02:00~06:00이면 발송하지 않고
   `{ ok: true, skipped: 'quiet-hours' }`. 심야 택시가 핵심 시나리오이므로 23~01시는
   발송한다. 보류된 알림은 큐잉하지 않고 버린다(방은 당일용이라 지연 발송이 무의미).
3. `favorites`에서 `from_location`/`to_location`이 일치하고 `notify_enabled = true`인
   `user_id` 조회. **방 생성자 본인은 제외**한다.
4. 대상자의 `push_subscriptions` 조회. 없으면 `{ ok: true, sent: 0 }`.
5. 발송.

```js
payload = {
  title: `${LOCATIONS[from]} → ${LOCATIONS[to]}`,
  body: `${departureLabel} 출발 방이 열렸어요`,
  url: `/rooms/${roomId}`,
  roomId,
  tag: `route-${roomId}`,   // 같은 방 중복 알림 대체
}
```

`tag`를 방 단위로 두어 동일 방 알림이 중첩되지 않게 한다.

### 앱 내 폴백

푸시 권한을 거부했거나 미지원 브라우저인 이용자를 위해, 구독 경로에 열린 방을 앱 안에서
확인할 수 있어야 한다.

- FAB에 미확인 표시(빨간 점).
- `/routes` 화면에 "내 경로에 열린 방" 섹션.
- 기준: 구독 경로 + `status='active'` + `departure_time`이 현재 이후.
- 확인 처리는 `localStorage`에 마지막 확인 시각을 저장하는 방식으로 충분하다. 서버 상태를
  추가하지 않는다.

---

## 3. 푸시 권한 요청 재설계

### 문제

권한 요청이 `installed_home` 한 곳에서만 뜬다(`components/HomeClient.tsx:928`,
`trackEvent('push_prompt_shown', { source: 'installed_home' })`). PWA를 설치한 이용자에게,
왜 필요한지 설명 없이 묻는다. 수락률 6%(84명 중 5명)는 이 설계의 결과다.

### 변경

요청 시점을 **경로 구독 완료 직후**로 옮긴다. "가천대역 1번출구 → 제2기숙사 방이 열리면
알려드릴까요?"에 대한 권한 요청은 맥락이 자명하다. 기존 `installed_home` 프롬프트는
유지하되(이미 설치한 이용자 대상), 구독 시점 요청을 주 경로로 삼는다.

거부해도 구독 자체는 유지된다. 알림만 앱 내 폴백으로 대체된다.

### 구독 유도 지점

| 지점 | 문구 | 근거 |
| --- | --- | --- |
| `/routes` 화면 | "알림 받을 경로 추가" | 명시적 관리 |
| 지도 하단 시트에서 출발지 선택 시 | "이 경로 알림 받기" | 이미 그 경로에 관심을 보인 순간 |
| **내가 만든 방이 아무도 없이 닫혔을 때** | "다음에 이 경로에 방이 열리면 알려드릴까요?" | 43개 방이 겪은 바로 그 순간. 가장 전환율이 높을 것으로 예상 |

세 번째가 핵심이다. `POST /api/rooms/[id]/leave`에서 `currentParticipants.length <= 1`로
방이 닫히는 분기(`route.ts:123`)의 응답에 플래그를 실어 클라이언트가 프롬프트를 띄운다.

```js
return NextResponse.json({ ok: true, closedAlone: true, from_location, to_location })
```

---

## 4. 진입점 — 지도 우하단 FAB

### 위치와 충돌 처리

`components/CampusRouteMap.tsx`에 추가한다. 코드상 제약이 있다.

- 하단은 `gatita-bottom-sheet`가 차지한다(`CampusRouteMap.tsx:578`, `inset-x-3`,
  `max-w-2xl`, z-30). `selectedFrom`이 있으면 모바일에서 하단 전체를 덮는다.
- 줌 컨트롤은 `top: 12.75rem; right: max(0.75rem, env(safe-area-inset-right))`
  (`app/globals.css:1096`).

따라서 FAB은 `bottom: max(1rem, env(safe-area-inset-bottom))`, `right`는 줌 컨트롤과
동일한 값으로 우측 정렬을 맞춘다. **`isSheetOpen`일 때 페이드아웃**한다(불투명도 +
`pointer-events: none`, 150ms). 시트가 열리면 이용자의 관심은 시트에 있으므로 FAB이
사라지는 것이 자연스럽다.

`PRODUCT.md`의 접근성 기준에 따라 터치 타깃 최소 40px 이상, 접근 가능한 이름을 둔다.

### 라우트

`/routes` — 내 알림 경로 관리.

- 구독 중인 경로 목록 (경로명, 알림 on/off 토글, 삭제)
- "경로 추가" — 출발지/도착지 선택. `isRestrictedRoutePair`(`lib/supabase.ts`)로 기존
  근거리 제한 규칙을 그대로 적용한다.
- "내 경로에 열린 방" 섹션 (앱 내 폴백)
- 푸시 권한이 없으면 상단에 "알림 켜기" 배너

---

## 데이터 흐름 요약

```
[구독]  이용자 → /routes → favorites insert → 푸시 권한 요청
[발송]  방 생성 → chat_rooms insert 트리거 → pg_net → /api/push/dispatch
        → favorites 조회(경로 일치, notify_enabled, 생성자 제외)
        → push_subscriptions 조회 → web-push 발송
[측정]  join/leave → room_participation_events 기록
```

---

## 에러 처리

| 상황 | 처리 |
| --- | --- |
| 트리거의 `net.http_post` 실패 | 예외를 삼키고 `raise warning`. 방 생성은 성공시킨다 |
| vault에 시크릿 없음 | 발송 생략. 방 생성은 성공 |
| 만료된 push 구독 (404/410) | 해당 endpoint 삭제 (기존 로직 재사용, `dispatch/route.ts:116`) |
| 참여 이력 기록 실패 | `console.error`만. 참여/나가기는 진행 |
| 푸시 권한 거부 | 구독은 유지, 앱 내 폴백으로 대체 |
| 심야(02~06시) | 발송 보류, 큐잉하지 않음 |

---

## 테스트

`npm test`(`node --test test/*.test.mjs`) 규약을 따른다.

**순수 함수 단위 테스트**
- 심야 보류 판정: 01:59 발송 / 02:00 보류 / 05:59 보류 / 06:00 발송 (Asia/Seoul 기준)
- 수신자 산출: 경로 일치 + `notify_enabled` + 생성자 제외
- FAB 표시 여부: `isSheetOpen` 참일 때 숨김

**통합 확인 (수동)**
- 경로 구독 → 다른 계정으로 그 경로에 방 생성 → 푸시 수신
- 생성자 본인에게는 미발송
- 권한 거부 상태에서 앱 내 폴백에 방이 뜨는지
- 방 나가기 → `room_participation_events.left_at` 기록 확인

---

## 측정 지표

이 작업의 성패는 다음으로 판단한다. 기준선은 46일간의 수치다.

| 지표 | 기준선 | 측정 방법 |
| --- | --- | --- |
| 참여자 2명 이상 방 비율 | 2/37 (5.4%) | `room_participation_events` |
| 푸시 권한 수락률 | 6% (5/84) | `push_subscriptions` / 실유저 |
| 경로 구독자 수 | 0 | `favorites` |
| 알림 → 방 입장 전환율 | 기준선 없음 (신규) | 신규 이벤트 `route_alert_opened` → `room_joined` |

근접 미스 2건(10분 차, 48분 차)이 알림으로 전환됐다면 매칭은 2건 → 4건이 됐을 것이다.
**다만 이 기능의 상한은 낮다.** 46일 중 같은 경로에 두 사람이 겹친 날이 4일뿐이므로,
알림은 이미 존재하는 낭비를 회수할 뿐 새 수요를 만들지 못한다. 근본 해법은 이용자 수이며,
이 작업은 그 전까지 전환 효율을 최대로 끌어올리는 것이 목적이다.

### 신규 분석 이벤트

기존 `trackEvent` 규약을 따른다.

```
route_subscribed          { from_location, to_location, source }
route_unsubscribed        { from_location, to_location }
route_alert_opened        { room_id, from_location, to_location }
push_prompt_shown         { source: 'route_subscribe' }   // 기존 이벤트에 source 추가
closed_alone_prompt_shown { from_location, to_location }
```

---

## 작업 순서

1. `room_participation_events` 테이블 + RLS + 백필 마이그레이션
2. join/leave/생성 경로에 이력 기록 추가
3. `favorites.notify_enabled` 컬럼 추가
4. `/api/push/dispatch`에 `room_id` 분기 + 심야 보류
5. `notify_new_room` 트리거
6. `/routes` 화면
7. 지도 FAB + 시트 충돌 처리
8. 구독 유도 지점 3곳 + 푸시 권한 요청 이동
9. 분석 이벤트

1~2가 먼저다. 이력이 쌓이기 시작해야 이후 변경의 효과를 측정할 수 있다.

모든 스키마 변경은 Supabase 마이그레이션으로 적용하고 `supabase_schema.sql`에 동기화한다
(프로젝트 `hggpwrtasyngpjcbwjzg`).
