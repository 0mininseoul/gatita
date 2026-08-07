# 경로 구독 알림 — 배포 절차

작성일: 2026-08-07
대상 브랜치: 경로 구독 알림 · 참여 이력 보존 · 당일 방 유지
설계: [2026-08-06-route-subscription-alerts-design.md](../specs/2026-08-06-route-subscription-alerts-design.md)

이 작업은 **마이그레이션을 의도적으로 적용하지 않은 채** 코드만 완성했다. dev/staging Supabase가
없어 모든 마이그레이션이 실사용자 84명의 라이브 DB(`hggpwrtasyngpjcbwjzg`)에 직접 가기 때문이다.
아래 절차를 사람이 직접 수행한다.

---

## 1. 마이그레이션 적용 순서

**파일명 순서와 다르다. 아래 순서를 지킬 것.**

```
1) 20260806090000_add_room_participation_events.sql
2) 20260806091000_add_route_alert_settings.sql
3) 20260806093000_grant_favorites_notify_update.sql   ← 091000 종속
4) 20260807000000_grant_favorites_full_update.sql     ← 093000 확장
5) [코드 배포]
6) 20260806092000_room_alert_notification.sql          ← 트리거는 맨 마지막
```

**왜 이 순서인가**

- **093000/20260807000000은 091000에 종속**된다. 091000이 만든 컬럼에 grant를 주므로, 역순 적용 시
  `column "notify_enabled" does not exist`로 즉시 실패한다.
- **092000(트리거)을 마지막에 두는 이유**: 트리거가 켜진 뒤 첫 방 생성부터 정상 발송되게 하기
  위함이다. 먼저 켜도 방 생성은 막히지 않지만(트리거가 예외를 삼킨다) 알림이 조용히 버려진다.
- **코드를 마이그레이션보다 먼저 배포하지 말 것.** `/api/routes`가 500이 되고,
  `app/routes/page.tsx`의 `loadRoutes`가 `res.ok`를 확인하지 않아 사용자에게 "구독이 사라진"
  빈 화면으로 보인다. 크래시는 없지만 오해를 부른다.

## 2. 적용 직후 SQL 확인

```sql
-- (a) favorites 의 authenticated UPDATE 권한 범위 — 가장 중요
\dp public.favorites
--    upsert 가 ON CONFLICT DO UPDATE SET <payload 전체 컬럼> 으로 전개되고
--    Postgres 는 충돌 여부와 무관하게 SET 대상 전체에 ACL_UPDATE 를 검사한다.
--    user_id/from_location/to_location 에 update 가 없으면 모든 구독 생성이 500.

-- (b) 제약이 실제로 붙었는지 (do $$ if not exists 가드는 같은 이름이 있으면 조용히 건너뛴다)
select conname from pg_constraint where conrelid = 'public.favorites'::regclass;
--    기대: favorites_notify_weekdays_valid, favorites_notify_window_paired

-- (c) 참여 이력 백필 검증
select count(*) from public.room_participation_events;
select count(*) from public.room_participants;   -- 두 값이 일치해야 함

-- (d) 트리거가 의존하는 것들
select name from vault.decrypted_secrets where name = 'push_dispatch_secret';
select extname from pg_extension where extname = 'pg_net';
--    둘 중 하나라도 없으면 트리거가 조용히 no-op 이 된다 (방 생성은 정상)

-- (e) 트리거 등록 확인
select tgname from pg_trigger where tgrelid = 'public.chat_rooms'::regclass;
--    기대: notify_new_room_trigger 포함
```

## 3. 적용 직후 앱 확인 (별도 계정 2개 필요)

| # | 확인 | 왜 |
| --- | --- | --- |
| 1 | `POST /api/routes` — **신규 경로 1건 + 이미 있는 경로 재추가 1건** | 두 번째가 upsert 충돌 경로다. grant 문제가 여기서 드러난다 |
| 2 | `PATCH /api/routes/{id}` 토글 on/off, `DELETE` 1건 | `favorites` RLS 는 `with check` 가 없고 이 테이블은 0건이라 **한 번도 실제 검증된 적이 없다** |
| 3 | 계정 A 구독 → 계정 B가 그 경로에 방 생성 → **푸시 수신** | 경로 알림 분기는 런타임으로 한 번도 실행된 적이 없다 |
| 4 | 같은 조건에서 **구독 시간대 밖** 방 생성 → 미수신 | 시간대 판정이 실제로 거르는지 |
| 5 | 방 생성자 본인에게 미발송 | |
| 6 | 푸시 탭 → `/rooms/{id}` 진입 후 **비참여자가 실제로 입장 가능한지** | 알림의 종착점이 죽어 있으면 기능 전체가 무의미하다 |
| 7 | 방 나가기(혼자) → `closedAlone` 프롬프트 → "알림 받을게요" → `favorites` 행 생성 | 전환율이 가장 높을 지점 |
| 8 | `room_participation_events.left_at` 기록 확인 | |
| 9 | 방 생성 직후 Postgres 로그에 `room push dispatch notify failed` warning 없는지 | |

## 4. 배포 후 모니터링 (24시간)

`/api/push/dispatch` 로그에서 `{ok:true, recipients:0}`만 나오는지 본다. 나온다면 `favorites`
조회가 조용히 실패 중일 수 있다 — 그 경우를 구분하려고 조회 실패에 `console.error`를 넣어뒀다.

## 5. 안내 메일 발송 (최후행)

**위 3의 1~9가 전부 통과한 뒤에만 실행한다.** 메일을 받고 들어온 84명이 동작하지 않는 화면을
만나면 안 된다.

```bash
# (1) 환경변수 준비 — 로컬 .env.local 에는 없다. Vercel 값을 복사해 넣을 것.
#     RESEND_API_KEY / RESEND_FROM_EMAIL / RESEND_REPLY_TO

# (2) 대상자 확인 — 아무것도 발송하지 않는다
node scripts/send-route-alert-email.mjs --dry-run
#     기대: 약 83~84명 (관리자 ym5373@gachon.ac.kr 제외).
#     온보딩 미완료자 25명도 포함된다 — 복귀 유인이므로 의도된 것.

# (3) 본인 계정으로 렌더링 확인 (임시로 대상자를 본인 하나로 제한)
#     모바일 Gmail / 애플 메일에서 CTA 링크와 수신거부 문구를 눈으로 검증

# (4) 전체 발송 — 대상자 수와 샘플을 보여준 뒤 "send" 를 정확히 입력해야 진행된다.
#     stdin 이 TTY 가 아니면(파이프/CI) 에러로 중단된다.
node scripts/send-route-alert-email.mjs
```

`Idempotency-Key`(`gatita-route-alerts/${userId}`)로 재실행 시 중복 발송이 차단된다.

---

## 측정 기준선

배포 후 비교할 46일치 수치. **관리자 계정 제외.**

| 지표 | 기준선 |
| --- | --- |
| 참여자 2명 이상 방 비율 | 2/37 (5.4%) |
| PWA 설치율 | 10/59 (17%) |
| 설치자 중 푸시 수락률 | 3/10 (30%) |
| 경로 구독자 수 | 0 |
| 알림 → 방 입장 전환율 | 기준선 없음 (신규) |
| 안내 메일 → 구독 전환율 | 기준선 없음 (신규) |

**이 기능의 상한은 두 겹으로 낮다.** (1) 46일 중 같은 경로에 두 사람이 겹친 날이 4일뿐이라
알림은 기존 낭비를 회수할 뿐 새 수요를 만들지 못한다. (2) 푸시가 닿는 이용자가 현재 10명이다.
설치율이 개선되지 않으면 (1)보다 (2)가 먼저 병목이 된다.

## 알려진 부채 (머지 후 처리)

- 지도 방 목록 정렬이 `useMemo([rooms, selectedFrom])`에 걸려 있어, 방이 "지난 방"으로 넘어가는
  순간 최대 2분간 배지·흐림만 반영되고 순서는 그대로다.
- FAB 배지가 `storage` 이벤트를 구독하지 않아 멀티탭에서 다른 탭의 `seen_at` 갱신이 지연된다.
- 지난 방 카드 `<div onClick>`에 `role`/`tabIndex`/`onKeyDown`이 없어 키보드·스크린리더
  사용자는 `past_room_viewed`를 발생시킬 수 없다 (`PRODUCT.md` 접근성 기준 위반).
- 푸시 클릭 경로에 `route_alert_opened`가 없다. 현재는 앱 내 폴백 카드 탭에만 있어
  "알림 → 방 입장 전환율"이 반쪽이다. `url`에 `?src=route_alert` 표식을 남기는 정도면 충분하다.
- `lib/routeSubscriptionValidation.ts`가 `notify_from`/`notify_weekdays`의 타입·형식을 검사하지
  않아 `{notify_weekdays:[99,'x']}` 같은 값이 통과하고 DB에서 터진다(400이어야 할 것이 500).
- `middleware.ts` 매처에 `/routes`가 빠져 있어 `Cache-Control: private, no-store`가 안 붙는다.
- `app/rooms/[id]/page.tsx`의 closed_alone 구독 성공 시 미설치자에게 설치 시트를 띄우지 않는다.
  전환율이 가장 높다고 본 지점이라 설치 유도를 놓치고 있다.
- 설치 안내 시트가 `components/HomeClient.tsx`(인라인, export 안 됨)와 `app/routes/page.tsx`에
  중복 존재한다.
- `app/rooms/page.tsx`는 진입 경로가 없는 고아 페이지다(URL 직접 접근만 가능).
