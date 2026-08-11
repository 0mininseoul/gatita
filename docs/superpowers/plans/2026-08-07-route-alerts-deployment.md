# 경로 구독 알림 — 배포 절차

작성일: 2026-08-07 / 갱신: 2026-08-11 (마이그레이션 적용 완료 반영)
설계: [2026-08-06-route-subscription-alerts-design.md](../specs/2026-08-06-route-subscription-alerts-design.md)

---

## 현재 상태 (2026-08-11)

### 완료된 것

**참여 이력 테이블은 기존 것을 채택했다.** 이 브랜치는 원래 `room_participation_events`를
새로 만들려 했으나, 프로덕션에 같은 목적의 `room_participant_events`가 이미 존재했다
(52건 백필, 이 브랜치 작업 중 별도 경로로 적용됨). 사용자 결정으로 기존 테이블을 채택하고
코드를 이벤트 로그 방식(`event_type` = `'joined'` / `'left'`)으로 전환했다.

**아래 3개는 프로덕션에 적용 완료.**

| 마이그레이션 | 내용 |
| --- | --- |
| `20260806091000` | `favorites` 알림 컬럼 4개 + CHECK 제약 2개 + 파셜 인덱스 |
| `20260806093000` | `favorites` notify_* 컬럼 update grant |
| `20260807000000` | `favorites` 테이블 전체 update grant (최종 리뷰 C-1) |

적용 후 검증 결과 — **전부 정상**:

```
알림 컬럼      notify_enabled(기본 true) / notify_from / notify_to / notify_weekdays(기본 7일)
CHECK 제약     favorites_notify_weekdays_valid, favorites_notify_window_paired
인덱스         favorites_route_idx
authenticated  SELECT INSERT UPDATE DELETE  ← C-1 해소 확인
```

동작 검증(롤백되는 트랜잭션 안에서 실제 삽입):

```
빈 요일 배열 '{}'        → 거부   (array_length 가 NULL 을 반환하던 버그가 실제로 막힘)
평일 17:00~20:00         → 통과
자정 넘김 22:00~02:00    → 통과   (심야 택시 시나리오)
반쪽 구간 (from 만)      → 거부
범위 밖 요일 '{7}'       → 거부
```

**C-1 은 실제 문제였다.** `20260806093000` 만 적용된 상태에서는 `notify_*` 컬럼에만 UPDATE
권한이 있었고, PostgREST 의 upsert 는 `ON CONFLICT DO UPDATE SET <payload 전체 컬럼>` 으로
전개되어 `user_id`/`from_location`/`to_location` 에도 UPDATE 권한을 요구한다. `20260807000000`
적용 후 세 컬럼 모두 권한이 붙은 것을 확인했다.

### 남은 것

**`20260806092000_room_alert_notification.sql` (방 생성 트리거) — 코드 배포 후 적용.**

먼저 적용하면 `/api/push/dispatch` 가 아직 `room_id` 를 모르는 상태라 400 이 쌓인다. 트리거가
예외를 삼키므로 방 생성 자체는 정상이지만 알림은 조용히 버려진다.

---

## 마이그레이션 이력에 대한 주의

**이 저장소의 로컬 마이그레이션과 프로덕션 이력이 어긋나 있다.** 과거에 일부 변경이
대시보드/다른 경로로 적용되어 원격에만 다른 타임스탬프로 기록돼 있다.

- `supabase db push` 를 그냥 돌리면 로컬에만 있는 **오래된 마이그레이션 11개를 재실행**하려 든다
  (`20260622091000_backfill_users.sql` 같은 백필 포함). 2026-08-11 에 그 11개와
  `20260806090500`(이미 존재하는 테이블)을 `migration repair --status applied` 로 이력에만
  기록해 해소했다 — SQL 은 실행되지 않는다.
- 그럼에도 `db push` 는 **원격에만 있는 13개** 때문에 거부한다
  (`LegacyDbPushMissingLocalError`). 그래서 위 3개는 Management API 의 query 엔드포인트로
  단일 트랜잭션으로 직접 적용하고 `supabase_migrations.schema_migrations` 에 버전을 기록했다.
- **앞으로도 `db push` 대신 같은 방식을 쓰거나, 먼저 `db pull` 로 로컬을 원격에 맞춰야 한다.**

---

## 남은 배포 순서

```
1) [코드 배포 = PR 머지 → Vercel 자동 배포]
2) 20260806092000_room_alert_notification.sql 적용
3) 아래 검증
4) 안내 메일 발송 (검증 통과 후에만)
```

### 트리거 적용 후 SQL 확인

```sql
select tgname from pg_trigger where tgrelid = 'public.chat_rooms'::regclass;
--    기대: notify_new_room_trigger 포함

select name from vault.decrypted_secrets where name = 'push_dispatch_secret';
select extname from pg_extension where extname = 'pg_net';
--    둘 중 하나라도 없으면 트리거가 조용히 no-op 이 된다 (방 생성은 정상)
```

### 앱 확인 (별도 계정 2개 필요)

| # | 확인 | 왜 |
| --- | --- | --- |
| 1 | `POST /api/routes` — 신규 경로 + **이미 있는 경로 재추가** | 두 번째가 upsert 충돌 경로. C-1 이 여기서 드러난다 |
| 2 | `PATCH /api/routes/{id}` 토글 on/off, `DELETE` | `favorites` RLS 는 `with check` 가 없고 이 테이블은 오래 0건이었다 |
| 3 | 계정 A 구독 → 계정 B 가 그 경로에 방 생성 → **푸시 수신** | 경로 알림 분기는 런타임으로 실행된 적이 없다 |
| 4 | 구독 **시간대 밖** 방 생성 → 미수신 | 시간대 판정이 실제로 거르는지 |
| 5 | 방 생성자 본인에게 미발송 | |
| 6 | 푸시 탭 → `/rooms/{id}` 진입 후 **비참여자가 입장 가능한지** | 알림의 종착점이 죽어 있으면 기능 전체가 무의미 |
| 7 | 방 나가기(혼자) → `closedAlone` 프롬프트 → 구독 생성 확인 | 전환율이 가장 높을 지점 |
| 8 | `room_participant_events` 에 `joined`/`left` 가 쌓이는지 | |
| 9 | 방 생성 직후 Postgres 로그에 `room push dispatch notify failed` warning 없는지 | |

### 배포 후 모니터링 (24시간)

`/api/push/dispatch` 로그에서 `{ok:true, recipients:0}` 만 나오는지 본다. 나온다면 `favorites`
조회가 조용히 실패 중일 수 있다 — 그 경우를 구분하려고 조회 실패에 `console.error` 를 넣어뒀다.

---

## 안내 메일 발송 (최후행)

**위 앱 확인 1~9 가 전부 통과한 뒤에만 실행한다.** 메일을 받고 들어온 90여 명이 동작하지 않는
화면을 만나면 안 된다.

```bash
# (1) 환경변수 준비 — 로컬 .env.local 에 없다. Vercel 값을 복사해 넣을 것.
#     RESEND_API_KEY / RESEND_FROM_EMAIL / RESEND_REPLY_TO
#     (.env.local 하단에 주석으로 자리를 남겨뒀다)

# (2) 대상자 확인 — 아무것도 발송하지 않는다
node scripts/send-route-alert-email.mjs --dry-run
#     관리자(ym5373@gachon.ac.kr) 제외. 온보딩 미완료자도 포함된다 — 복귀 유인이므로 의도된 것.

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
알림은 기존 낭비를 회수할 뿐 새 수요를 만들지 못한다. (2) 푸시가 닿는 이용자가 10명이다.
설치율이 개선되지 않으면 (1)보다 (2)가 먼저 병목이 된다.

## 알려진 부채 (머지 후 처리)

- 지도 방 목록 정렬이 `useMemo([rooms, selectedFrom])` 에 걸려 있어, 방이 "지난 방"으로 넘어가는
  순간 최대 2분간 배지·흐림만 반영되고 순서는 그대로다.
- FAB 배지가 `storage` 이벤트를 구독하지 않아 멀티탭에서 다른 탭의 `seen_at` 갱신이 지연된다.
- 지난 방 카드 `<div onClick>` 에 `role`/`tabIndex`/`onKeyDown` 이 없어 키보드·스크린리더
  사용자는 `past_room_viewed` 를 발생시킬 수 없다 (`PRODUCT.md` 접근성 기준 위반).
- 푸시 클릭 경로에 `route_alert_opened` 가 없다. 현재는 앱 내 폴백 카드 탭에만 있어
  "알림 → 방 입장 전환율" 이 반쪽이다. `url` 에 `?src=route_alert` 표식이면 충분하다.
- `lib/routeSubscriptionValidation.ts` 가 `notify_from`/`notify_weekdays` 의 타입·형식을 검사하지
  않아 `{notify_weekdays:[99,'x']}` 같은 값이 통과하고 DB 에서 터진다(400 이어야 할 것이 500).
- `middleware.ts` 매처에 `/routes` 가 빠져 있어 `Cache-Control: private, no-store` 가 안 붙는다.
- `app/rooms/[id]/page.tsx` 의 closed_alone 구독 성공 시 미설치자에게 설치 시트를 띄우지 않는다.
- 설치 안내 시트가 `components/HomeClient.tsx`(인라인, export 안 됨)와 `app/routes/page.tsx` 에
  중복 존재한다.
- `app/rooms/page.tsx` 는 진입 경로가 없는 고아 페이지다(URL 직접 접근만 가능).
- **마이그레이션 이력 드리프트** — 위 "주의" 절 참고. 근본적으로는 `db pull` 로 로컬을 원격에
  맞춰 정리해야 한다.
