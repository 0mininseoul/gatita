# 경로 구독 알림 · 참여 이력 보존 · 당일 방 유지 — 설계

작성일: 2026-08-06 (2026-08-06 개정: 구독 시간대 설정 추가, 푸시 진단 정정, 당일 방 유지와
안내 이메일 편입)

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
| `ride_completions` | 0건 |

도달 채널 퍼널은 별도로 봐야 한다. "푸시 6%"는 두 단계를 뭉뚱그린 오해를 낳는 숫자다.

```
실유저 84 → 온보딩 완료 59 → PWA 설치 10 (온보딩의 17%) → 푸시 허용 3 (설치자의 30%)
                                                          + 미설치 상태 푸시 허용 1
```

**병목은 푸시 프롬프트가 아니라 PWA 설치율 17%다.** 설치자 대비 푸시 수락률 30%는 웹
푸시 업계 평균(20~40%) 범위 안이고, 프롬프트에는 이미 설명 문구가 있다
(`components/HomeClient.tsx:1914`). 즉 **권한을 물어볼 기회 자체가 10명에게만 생긴다.**

이는 이 스펙 전체의 제약 조건이다. iOS Safari는 홈 화면 추가 없이 웹 푸시를 지원하지
않으므로, 현 상태에서 **경로 구독 알림이 푸시로 닿을 수 있는 상한은 약 10명이다.**
따라서 (a) 앱 내 폴백이 부가 기능이 아니라 주 경로이며, (b) 84명 전체에 닿는 유일한
채널인 이메일의 비중이 커지고, (c) 설치율 개선이 이 기능의 선결 조건이다.

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

1. **경로 구독 알림.** 이용자가 평소에 관심 경로와 **알림 받을 시간대**를 등록해 두면,
   그 조건에 맞는 방이 열릴 때 알림을 받는다. 앱을 열고 있지 않아도 매칭이 성립하게 하여
   **동시 접속 요구를 제거**한다.
2. **PWA 설치율 개선.** 현재 온보딩 완료자의 17%(10명). 푸시가 닿는 범위를 결정하는
   상위 제약이므로 함께 다룬다. 푸시 프롬프트 자체는 이미 설명이 있고 수락률도 정상
   범위라 손대지 않는다.
3. **참여 이력 보존.** 방을 나가거나 닫아도 "누가 언제 참여했다 언제 나갔다"가 남는다.
   1번의 효과를 측정할 근거를 확보한다.
4. **지도 우하단 진입점(FAB).** 내 알림 경로 관리 화면으로 연결한다.
5. **오늘 방 목록 유지.** 출발 30분 후 사라지던 방을 당일에 한해 계속 노출한다.
6. **기능 안내 이메일.** 기존 Resend 인프라로 전체 이용자에게 업데이트를 알려 구독을
   유도한다. 푸시가 10명에게만 닿는 현 상황에서 84명 전체에 도달하는 유일한 채널이다.

### 비목표

- 커뮤니티/게시판 기능. 별도 검토에서 현 규모(84명)에는 시기상조로 판단됐다. 하루 1~3건
  나오는 피드는 습관을 만들지 못하고, 유저 수를 늘리려 커뮤니티를 넣는 것은 순환 논리다.
  DAU 100~150 이후 재검토한다.
- 정기 통학 시간표 자동 매칭(등록해 둔 패턴으로 시스템이 방을 자동 생성). 구독 알림으로
  얻는 데이터를 본 뒤 판단한다.
- PWA 설치 유도의 전면 재설계(온보딩 흐름 변경 등). 이번에는 기존 설치 시트의 노출
  지점을 넓히는 선에서 다루고, 효과를 측정한 뒤 판단한다.
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
  add column notify_enabled boolean not null default true,
  add column notify_from time,                       -- null = 종일
  add column notify_to time,                         -- null = 종일
  add column notify_weekdays smallint[] not null default '{0,1,2,3,4,5,6}';  -- 0=일 … 6=토
```

**시간대 설정은 필수 설계 요소다.** 초안에서는 "하루 0.8개라 필터링할 물량이 아니다"라는
이유로 제외했으나 이는 잘못된 판단이었다. 두 가지 이유로 뒤집는다.

1. 이 기능이 성공하면 방 생성량이 늘고, **알림이 성가셔지는 시점은 정확히 기능이 작동하기
   시작하는 시점이다.** 성공을 전제로 설계해야 한다.
2. 빈도와 무관하게 **관련성 문제다.** 오전 9시에 통학하는 이용자는 23시 방 알림을 물량이
   적든 많든 원하지 않는다.

`notify_from`/`notify_to`는 방의 `departure_time` 기준으로 판정한다(알림 발송 시각이
아니라 출발 시각 기준 — 이용자가 원하는 것은 "내가 탈 만한 시간대의 방"이다).

**자정 넘김 처리.** `notify_from > notify_to`이면 자정을 넘는 구간으로 해석한다
(예: `22:00 ~ 02:00`). 심야 택시가 핵심 시나리오이므로 반드시 지원해야 한다.

```
종일:        notify_from is null → 항상 통과
일반 구간:   from <= to  →  from <= departure_time <= to
자정 넘김:   from >  to  →  departure_time >= from OR departure_time <= to
```

`notify_weekdays`는 방의 `departure_date` 요일(Asia/Seoul)로 판정한다. 방을 2개 이상 만든
9명 중 7명이 단일 경로를 반복한 것으로 보아 통학은 요일 패턴을 가지므로, "평일만" 같은
설정이 실제로 쓰일 것으로 본다.

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

1. `chat_rooms`에서 `from_location`, `to_location`, `created_by`, `departure_date`,
   `departure_time` 조회. 없으면 `{ ok: true, skipped: 'room-not-found' }`.
2. `favorites`에서 다음을 **모두** 만족하는 `user_id` 조회.
   - `from_location`/`to_location` 일치
   - `notify_enabled = true`
   - `departure_time`이 `notify_from`~`notify_to` 구간 안 (자정 넘김 규칙 적용, null이면 통과)
   - `departure_date`의 요일이 `notify_weekdays`에 포함
   - **방 생성자 본인은 제외**
3. 대상자의 `push_subscriptions` 조회. 없으면 `{ ok: true, sent: 0 }`.
4. 발송.

전역 심야 보류는 두지 않는다. 이용자가 `notify_from`/`notify_to`로 직접 제어하므로
전역 규칙은 명시적 설정을 덮어쓰는 부작용만 낳는다. 다만 **`종일`(null)로 둔 구독에
한해서만** 02:00~06:00 발송을 보류한다 — 아무 설정도 하지 않은 이용자를 새벽에 깨우지
않기 위한 기본값이다. 보류된 알림은 큐잉하지 않고 버린다(방은 당일용이라 지연 발송이
무의미).

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

## 3. 도달 채널 — PWA 설치율

### 문제 재정의

초안은 "푸시 수락률 6%"를 문제로 잡고 요청 시점을 경로 구독으로 옮기려 했다. 퍼널을
분해하면 진단이 달라진다.

```
온보딩 완료 59 → PWA 설치 10 (17%) → 푸시 허용 3 (설치자의 30%)
```

- 푸시 프롬프트에는 **이미 설명이 있다** (`components/HomeClient.tsx:1914`, "동승자가
  채팅을 보내면 앱을 열지 않아도 푸시 알림으로 바로 받아볼 수 있어요").
- 설치자 대비 수락률 30%는 웹 푸시 업계 평균(20~40%) 범위 안이다.
- 따라서 프롬프트는 문제가 아니다. **권한을 물어볼 기회가 10명에게만 생기는 것**이 문제다.

또한 요청 시점을 경로 구독으로 옮기는 것은 오히려 퍼널을 좁힌다. 푸시는 채팅 알림이라는
더 큰 용도를 겸하므로, 경로 구독까지 도달한 이용자에게만 묻는 것은 손해다.

### 변경

**기존 `installed_home` 프롬프트를 주 경로로 유지한다.** 문구·시점 모두 그대로 둔다.

대신 **설치 유도 노출을 넓힌다.** iOS Safari는 홈 화면 추가 없이 웹 푸시를 지원하지
않으므로 설치가 곧 도달 범위다.

- 경로 구독 완료 시, 미설치 이용자에게 설치 안내 시트를 띄운다("알림을 받으려면 홈 화면에
  추가해야 해요"). 푸시 권한을 새로 묻는 것이 아니라 **설치를 유도**하는 것이다.
- 이미 설치했으나 푸시를 거부한 이용자에게는 기존 프롬프트를 재노출하지 않는다. 거부는
  존중한다.

푸시가 없어도 구독 자체는 유지되며 앱 내 폴백으로 대체된다. 현 설치율에서는 **폴백이
사실상 주 경로**임을 전제로 UI를 설계한다.

### 구독 유도 지점

| 지점 | 문구 | 근거 |
| --- | --- | --- |
| `/routes` 화면 | "알림 받을 경로 추가" | 명시적 관리 |
| 지도 하단 시트에서 출발지 선택 시 | "이 경로 알림 받기" | 이미 그 경로에 관심을 보인 순간 |
| ~~내가 만든 방이 아무도 없이 닫혔을 때~~ (2026-08-11 제거) | ~~"다음에 이 경로에 방이 열리면 알려드릴까요?"~~ | 43개 방이 겪은 바로 그 순간이라 가장 전환율이 높을 것으로 예상했으나, 실사용에서 나가기 직후 매번 뜨는 것이 성가시다는 피드백을 받아 제거했다. 대체 지점은 아래 네 번째 행 |
| **같은 경로로 방을 2회 이상 생성했을 때** | "이 경로에 방이 생기면 알림을 받아보시겠어요?" | 46일 실측: 방을 2개 이상 만든 9명 중 7명이 단일 경로 반복 — 반복 생성 자체가 관심의 신호. `components/HomeClient.tsx`의 `repeatRoutePrompt`(followup 스펙 8-2)로 구현 |

**세 번째 행(닫힘 시 프롬프트)은 구현됐다가 2026-08-11 제거됐다.** 당시
`POST /api/rooms/[id]/leave`가 `currentParticipants.length <= 1`로 방이 닫히는
분기(`route.ts:123`)의 응답에 아래처럼 플래그를 실어 클라이언트가 프롬프트를 띄우게
했었다.

```js
// 제거된 구현 — 현재 코드에는 없다. 아래 "제거 이력" 참고.
return NextResponse.json({ ok: true, closedAlone: true, from_location, to_location })
```

**제거 이력.** 나가기 직후 매번 뜨는 프롬프트가 성가시다는 사용자 피드백을 받아 제거했다.
현재 `leave/route.ts`의 응답은 `{ ok: true }`뿐이고, `closedAlone`이라는 이름은 코드
어디에도 없다(`app/api/rooms/[id]/leave/route.ts` 참고). 대체 지점은 네 번째 행 —
**같은 경로로 2회 이상 방을 만든 직후**(방 생성 완료 시점이지 나가기 시점이 아니다)로
옮겼다. "실패의 순간(혼자 남아 방이 닫힘)"보다 "의도가 이미 확인된 순간(같은 경로를
반복해서 찾음)"이 잡음이 적다고 판단했다.

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

## 5. 오늘 방 목록 유지

### 현재 동작

지도 하단 시트의 방 목록은 **출발 시각 + 30분**이 지나면 사라진다.

- `lib/supabase.ts:294` — `ROOM_MAP_VISIBILITY_WINDOW_MINUTES = 30`
- `lib/supabase.ts:304` — `isRoomVisibleOnMap()` = `departure + 30분 >= now`
- `components/HomeClient.tsx:433` — 조회 결과에 이 필터를 적용

### 변경

**출발일이 오늘(Asia/Seoul)인 방은 시각과 무관하게 계속 노출한다.** 내일 방은 기존대로
노출한다(`getMapRoomDateRange`가 오늘·내일을 반환하는 동작은 유지).

```ts
export function isRoomVisibleOnMap(departureDate: string, departureTime: string, now = new Date()) {
  // 출발일이 오늘이면 지난 방이라도 계속 노출한다.
  if (departureDate === formatLocalDate(now)) return true
  return getRoomDepartureDateTime(departureDate, departureTime).getTime() >= now.getTime()
}
```

`ROOM_MAP_VISIBILITY_WINDOW_MINUTES`는 사용처가 사라지므로 제거한다.

**주의.** `formatLocalDate`(`lib/supabase.ts:200`)는 브라우저 로컬 타임존을 쓴다.
`isRoomVisibleOnMap`은 클라이언트에서만 호출되므로(국내 이용자 = KST) 문제없지만,
**서버(Vercel, UTC)에서는 재사용하면 안 된다.** 2번 항목의 요일 판정은 서버에서 돌므로
KST를 명시적으로 계산해야 한다.

### 입장 차단과의 정합성

`isRoomJoinable()`(`lib/supabase.ts:300`)은 그대로 둔다. 출발 시각이 지난 방은 **보이지만
입장할 수 없다.** 지금은 목록에서 사라지므로 문제가 없었지만, 변경 후에는 이용자가 지난
방을 눌렀다가 `past_departure` 에러(`components/HomeClient.tsx:1300`)를 만나게 된다.

따라서 시트 UI에서 지난 방을 **시각적으로 구분**해야 한다.

- 흐리게 처리하고 "출발함" 배지를 붙인다.
- 입장 버튼을 비활성화한다(누를 수 있게 두고 에러를 띄우지 않는다).
- 정렬은 출발 시각 오름차순을 유지하되, 지난 방은 목록 하단으로 내린다.

`PRODUCT.md`의 "색상만으로 상태를 구분하지 않고 텍스트, 아이콘, 비활성 상태를 함께
사용한다"에 따라 배지 텍스트를 반드시 포함한다.

### 근거

당일 방을 남기면 "오늘 이 지점에서 사람들이 실제로 움직였다"는 것이 보인다. 현재는 방이
없는 시간대에 지도가 완전히 비어 보여 서비스가 죽은 것처럼 읽힌다. 하루 0.8개 생성
규모에서는 지난 방이라도 남아 있는 편이 활동의 증거가 된다.

---

## 6. 기능 안내 이메일

### 기존 인프라

Resend가 이미 구성돼 있다(`lib/welcome-email.ts`). 신규 의존성이 필요 없다.

- 환경변수: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`
- `fetch('https://api.resend.com/emails')` 직접 호출, SDK 미사용
- `Idempotency-Key` 헤더로 중복 발송 방지 (`gatita-welcome/${userId}` 패턴)

**주의: 이 환경변수들은 로컬 `.env.local`에 없다.** Vercel에만 설정돼 있으므로 로컬에서
발송을 테스트하려면 추가해야 한다.

### 발송 대상

`user_private_profiles`에서 다음 조건.

- `status = 'active'`
- `is_admin = false`
- `email` 존재

온보딩 미완료자(`onboarded_at is null`)도 포함한다. 84명 중 25명이 여기 해당하며, 이들에게
기능 안내는 온보딩 복귀 유인이 된다.

### 구현

`scripts/`에 일회성 발송 스크립트를 둔다(`scripts/preview-test-accounts.mjs` 패턴).
관리자 API 라우트로 만들지 않는다 — 일회성 캠페인이고, 실수로 재발송될 여지를 줄이는 편이
낫다.

- `Idempotency-Key`: `gatita-route-alerts/${userId}` — 재실행해도 중복 발송되지 않는다.
- `--dry-run` 플래그로 대상자 수와 샘플만 출력하는 모드를 지원한다.
- 순차 발송(동시성 제한). 84명 규모라 Resend rate limit은 문제되지 않는다.
- 실패한 수신자는 stderr에 남기고 계속 진행한다. 전체를 중단하지 않는다.

### 내용

`createWelcomeEmail()`과 동일한 테이블 기반 HTML 구조를 따른다(이메일 클라이언트 호환성).

- 핵심 메시지: "경로를 등록해두면 그 경로에 방이 열릴 때 알려드려요"
- CTA: `/routes`로 연결 (`utm_source=feature_email&utm_campaign=route_alerts`)
- 홈 화면 추가 안내를 함께 넣는다 — 푸시 도달 상한이 설치율에 걸려 있으므로 이 메일이
  설치율을 올릴 기회이기도 하다.
- **수신거부 링크를 반드시 포함한다.** 기능 안내는 거래관계상 정보성 메일에 가깝지만,
  수신거부 수단을 두는 것이 안전하고 관행에도 맞다.

---

## 데이터 흐름 요약

```
[구독]  이용자 → /routes → favorites insert (경로 + 시간대 + 요일)
                        → 미설치면 홈 화면 추가 안내
[발송]  방 생성 → chat_rooms insert 트리거 → pg_net → /api/push/dispatch
        → favorites 조회(경로 일치 · notify_enabled · 시간대 · 요일 · 생성자 제외)
        → push_subscriptions 조회 → web-push 발송
[폴백]  구독 경로에 열린 방 → FAB 빨간 점 → /routes "내 경로에 열린 방"
[측정]  join/leave → room_participation_events 기록
[안내]  scripts 일회성 발송 → Resend → 전체 이용자
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
| 심야(02~06시) | `종일` 구독에 한해 발송 보류, 큐잉하지 않음. 명시적 시간대 설정은 그대로 발송 |
| 안내 메일 개별 실패 | stderr 기록 후 다음 수신자로 계속. 전체 중단하지 않음 |
| 안내 메일 재실행 | `Idempotency-Key`로 중복 발송 차단 |

---

## 테스트

`npm test`(`node --test test/*.test.mjs`) 규약을 따른다.

**순수 함수 단위 테스트**

시간대 판정이 이 기능에서 가장 틀리기 쉬운 부분이므로 집중해서 검증한다.

- 일반 구간 (`09:00~12:00`): 08:59 제외 / 09:00 포함 / 12:00 포함 / 12:01 제외
- **자정 넘김 (`22:00~02:00`)**: 22:00 포함 / 23:30 포함 / 00:30 포함 / 02:00 포함 /
  03:00 제외 / 12:00 제외
- 종일 (`null`): 모든 시각 통과
- 요일 판정: `departure_date`의 Asia/Seoul 요일이 `notify_weekdays`에 있을 때만 통과.
  UTC 기준으로 계산하면 자정 근처 날짜가 밀리므로 반드시 KST로 판정
- 심야 보류: 종일 구독은 02:00~06:00 보류 / 명시적 시간대 구독은 같은 시각에도 발송
- 수신자 산출: 경로 일치 + `notify_enabled` + 생성자 제외
- `isRoomVisibleOnMap`: 오늘 지난 방 노출 / 오늘 미래 방 노출 / 내일 방 노출 /
  어제 방 미노출
- FAB 표시 여부: `isSheetOpen` 참일 때 숨김

**통합 확인 (수동)**
- 경로 구독 → 다른 계정으로 그 경로에 방 생성 → 푸시 수신
- 구독 시간대 **밖의** 방을 만들었을 때 미수신
- 생성자 본인에게는 미발송
- 권한 거부 상태에서 앱 내 폴백에 방이 뜨는지
- 방 나가기 → `room_participation_events.left_at` 기록 확인
- `favorites` insert/update/delete가 RLS를 통과하는지 (0건이라 미검증 상태)
- 지난 방이 시트에 흐리게 표시되고 입장 버튼이 비활성인지
- 안내 메일 `--dry-run` 대상자 수가 예상과 일치하는지

---

## 측정 지표

이 작업의 성패는 다음으로 판단한다. 기준선은 46일간의 수치다.

| 지표 | 기준선 | 측정 방법 |
| --- | --- | --- |
| 참여자 2명 이상 방 비율 | 2/37 (5.4%) | `room_participation_events` |
| **PWA 설치율** | 10/59 (17%) | `user_private_profiles.pwa_installed` / 온보딩 완료 |
| 설치자 중 푸시 수락률 | 3/10 (30%) | `push_enabled` / `pwa_installed` |
| 경로 구독자 수 | 0 | `favorites` |
| 알림 → 방 입장 전환율 | 기준선 없음 (신규) | 신규 이벤트 `route_alert_opened` → `room_joined` |
| 안내 메일 → 구독 전환율 | 기준선 없음 (신규) | `utm_campaign=route_alerts` → `route_subscribed` |

근접 미스 2건(10분 차, 48분 차)이 알림으로 전환됐다면 매칭은 2건 → 4건이 됐을 것이다.

**이 기능의 상한은 두 겹으로 낮다.**

1. 46일 중 같은 경로에 두 사람이 겹친 날이 4일뿐이다. 알림은 이미 존재하는 낭비를 회수할
   뿐 새 수요를 만들지 못한다.
2. 푸시가 닿는 이용자가 현재 10명이다. 설치율이 오르지 않으면 알림 경로 자체가 대부분의
   이용자에게 작동하지 않는다.

근본 해법은 이용자 수이며, 이 작업은 그 전까지 전환 효율을 최대로 끌어올리는 것이 목적이다.
**설치율(17%)이 개선되지 않으면 1번보다 2번이 먼저 병목이 된다**는 점을 실행 중에 계속
확인해야 한다.

### 신규 분석 이벤트

기존 `trackEvent` 규약을 따른다.

```
route_subscribed          { from_location, to_location, source, has_time_window, weekday_count }
route_unsubscribed        { from_location, to_location }
route_alert_opened        { room_id, from_location, to_location }
route_alert_fallback_seen  { room_count }                  // 앱 내 폴백 노출
repeat_route_prompt_shown { from_location, to_location, created_room_count }
room_create_blocked       { from_location, to_location, departure_time, reason }
pwa_install_instruction_shown { source: 'route_subscribe' }  // 기존 이벤트에 source 추가
past_room_viewed          { room_id }                      // 지난 방 노출 후 탭
```

`has_time_window`로 실제로 시간대를 설정하는 비율을 본다. 대부분이 종일로 두면 이 설계가
과잉이었다는 신호이고, 다수가 설정하면 초안에서 제외했던 판단이 틀렸음이 확인된다.

**`closed_alone_prompt_shown`은 이 목록에서 뺐다(I-3, 2026-08-11).** "구독 유도 지점"
절에서 설명한 대로 그 프롬프트 자체가 성가심 피드백으로 제거됐고, 이 이벤트를 발화하는
코드는 애초에 존재한 적이 없다(구현 순서상 이벤트 계장보다 프롬프트가 먼저 빠졌다).
canonical 정의가 실제로 발화하지 않는 이벤트로 남아 있으면 다음 사람이 이 문서만 보고
재구현할 위험이 있어 여기서 없앤다. 대체 지점의 이벤트가 `repeat_route_prompt_shown`이다
(I-1, followup 리뷰).

**`room_create_blocked`(I-2)는 중복 방 생성이 클라이언트 사전 검사에서 막힌 시점에
발화한다** (`lib/duplicateRoom.ts`의 `findDuplicateActiveRoom`, `components/HomeClient.tsx`
`handleCreateMapRoom`). `app/rooms/page.tsx`에도 같은 차단 로직이 있지만 이벤트를 추가하지
않았다 — 그 페이지는 진입 경로가 없는 고아 페이지(위 비목표 참고)라 실제 트래픽이
발생하지 않으므로 측정할 대상이 없다.

---

## 작업 순서

**A. 측정 기반 (선행)**
1. `room_participation_events` 테이블 + RLS + 백필 마이그레이션
2. join/leave/생성 경로에 이력 기록 추가

**B. 오늘 방 목록 유지 (독립)**
3. `isRoomVisibleOnMap` 변경 + `ROOM_MAP_VISIBILITY_WINDOW_MINUTES` 제거
4. 시트 UI에 지난 방 구분 표시(흐림 + "출발함" 배지 + 입장 비활성)

**C. 경로 구독 알림**
5. `favorites` 컬럼 추가 (`notify_enabled`, `notify_from`, `notify_to`, `notify_weekdays`)
   + RLS 실동작 확인
6. 시간대·요일 판정 순수 함수 + 단위 테스트 (자정 넘김 포함)
7. `/api/push/dispatch`에 `room_id` 분기
8. `notify_new_room` 트리거
9. `/routes` 화면 (구독 관리 + 시간대 설정 + 앱 내 폴백)
10. 지도 FAB + 시트 충돌 처리 + 미확인 표시
11. 구독 유도 지점 3곳 + 미설치자 홈 화면 추가 안내
12. 분석 이벤트

**D. 안내 (최후행)**
13. Resend 일회성 발송 스크립트 + `--dry-run`

**A가 가장 먼저다.** 이력이 쌓이기 시작해야 이후 변경의 효과를 측정할 수 있다.
**B는 A~C와 독립적이며 변경 범위가 작으므로 먼저 배포해도 된다.**
**D는 기능이 배포·검증된 뒤에 실행한다.** 안내 메일을 받고 들어온 이용자가 동작하지 않는
화면을 만나면 안 된다.

모든 스키마 변경은 Supabase 마이그레이션으로 적용하고 `supabase_schema.sql`에 동기화한다
(프로젝트 `hggpwrtasyngpjcbwjzg`).
