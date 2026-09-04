# 같이타 배포 메모

## 현재 배포 대상

- Production URL: `https://gatita.kro.kr/`
- Vercel project: `0minseouls-projects/gatita`
- Supabase project: `GATITA-new`
- Supabase ref: `hggpwrtasyngpjcbwjzg`
- Supabase region: `ap-northeast-2`

## Vercel

필수 환경변수:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

`NEXT_PUBLIC_*` 값은 build time에 번들에 포함되므로 값 변경 후에는 재배포가 필요합니다.

## Supabase

Google OAuth provider를 활성화하고 Google Cloud Console에 Supabase callback URL을 등록합니다.

```text
https://your-project-id.supabase.co/auth/v1/callback
```

앱 도메인 `https://gatita.kro.kr`은 Supabase Auth URL Configuration과 Kakao Developers 웹 플랫폼 도메인에 등록합니다.

## DB 변경

스키마 기준 파일:

- `supabase_schema.sql`

마이그레이션:

- `supabase/migrations/20260617065229_add_dormitory_locations.sql`
- `supabase/migrations/20260617065451_core_mvp_constraints.sql`

원격 DB 적용 전 확인:

```bash
supabase db push --linked
```

현재 로컬 Docker가 꺼져 있으면 local Supabase 명령은 실패할 수 있습니다. 원격 적용은 linked project와 DB password 또는 정상 CLI login role이 필요합니다.

### 기숙사 동행 요청

`supabase/migrations/20260904035539_add_dormitory_ride_requests.sql`은 비공개 프로필의 선택형
기숙사생 여부와 방 생성 출처를 추가합니다.
`supabase/migrations/20260904045000_secure_room_creation.sql`은 방과 방장 참여를 하나의
트랜잭션으로 생성하고, 기숙사 동행 요청의 빈 방·시간·경로·5분 제한을 서버에서
검증합니다. `supabase/migrations/20260904051000_lock_chat_room_mutations.sql`은 일반
브라우저 세션의 방 삽입·수정·삭제 권한을 제거해 생성 출처를 임의로 바꾸지 못하게
합니다. `supabase/migrations/20260904052500_defer_room_notification_until_participant.sql`은
방장 참여가 같은 트랜잭션에서 생성된 뒤에만 새 방 푸시를 예약합니다.

기존 PWA와 새 RPC 기반 클라이언트 사이의 무중단 전환은 다음 순서를 지킵니다.

1. `20260904053000_restore_legacy_room_creation_during_rollout.sql`로 기존 클라이언트의
   일반 방 생성만 임시 복구합니다. 동행 요청 출처는 여전히 RPC로만 생성할 수 있습니다.
2. `20260904054000_serialize_room_creation_and_align_time_window.sql`과
   `20260904054500_secure_capacity_check_for_rollout.sql`,
   `20260904054700_lock_all_room_creation_origins.sql`,
   `20260904054800_make_legacy_room_creation_atomic.sql`,
   `20260904054900_order_legacy_duplicate_guard_first.sql`까지 적용한 뒤 새 코드를 Vercel에
   배포합니다. 이 트리거들은 구버전 참여자 삽입이 방 UPDATE 권한 없이 정원을 잠그게 하고,
   모든 방 생성을 출발지별로 직렬화하며, 구버전 방 생성도 방장 참여까지 원자적으로
   완료합니다.
3. 새 서비스 워커는 이전 앱 캐시를 발견하면 열린 PWA 창을 한 번 새로고침합니다. 그래도
   장기간 중단된 PWA를 시간만으로 단정하지 않고, Supabase API 로그에서 직접
   `chat_rooms` INSERT가 없고 Amplitude `room_created`에 `creation_source`가 빠진 이벤트가
   없는 상태를 7일 연속 확인할 때까지 호환 정책을 유지합니다.
4. 위 관측 조건을 충족한 뒤 `20260904055000_finalize_rpc_room_creation.sql`을 적용해 임시
   정책을 제거하고 방 생성 경로를 RPC로만 제한합니다. 호환 기간에도 일반 방만 직접
   생성할 수 있고, DB 트리거가 방장 참여를 같은 트랜잭션에서 생성하므로 동행 요청 권한이나
   원자성을 완화하지 않습니다.

```bash
supabase db push --dry-run --project-ref hggpwrtasyngpjcbwjzg
supabase db push --project-ref hggpwrtasyngpjcbwjzg
supabase db lint --linked --project-ref hggpwrtasyngpjcbwjzg --level error --fail-on error
```

각 단계의 `dry-run`에서 해당 단계에 적용할 마이그레이션만 표시되는지 확인합니다. 배포 직후
`20260904055000_finalize_rpc_room_creation.sql`만 표시되는 것은 의도된 호환 상태입니다.
제2기숙사 출발 요청은
기존 전역 경로 규칙이 허용하는 목적지를 그대로 사용하고, 역·정문 출발 요청만 제2기숙사로
제한됩니다.

### Discord 일일 Metrics 알림

`supabase/migrations/20260807022519_daily_metrics_discord_alert.sql`, `supabase/migrations/20260807035352_backfill_location_sheet_events_from_amplitude.sql`, `supabase/migrations/20260807040353_refine_active_room_metric.sql`을 순서대로 적용하면 다음이 설정됩니다.

- 방 생성/참여 이력 수집 및 유저별 방문 횟수·최근 방문일 추적
- 기존 Amplitude `fixed_point_selected` 이력을 `location_sheet_view_events`로 일회성 backfill
- 전일 기준 유저 수, 방문자, 생성 방, 활성 방, 합승 성공, MAU, 온보딩율, PWA 설치율 계산
- 자주 방문한 유저 TOP3는 2026-06-15부터 기준일(KST)까지의 누적 방 입장 횟수로 계산
- 관리자 ID `5a018580-6558-44fc-a621-1fa2506e9d5e` 및 `is_admin = true` 계정 전체 제외
- Supabase Cron `gatita-daily-metrics-discord`를 `15:03 UTC`로 등록 (`00:03 KST`)
- Vault의 기존 `discord_bot_token`으로 Discord 채널 `1511605519322972320`에 발송
- Discord embed 제목에는 기준일을, 지표는 inline field로 한 줄에 3개씩 표시하며 변화량이 0이면 `+0`으로 표시

Vault 시크릿이 없다면 아래처럼 한 번만 등록합니다. 토큰 값은 레포나 환경변수에 커밋하지 않습니다.

```sql
select vault.create_secret('<BOT_TOKEN>', 'discord_bot_token');
```

적용 후에는 Supabase Dashboard의 Cron Jobs에서 `gatita-daily-metrics-discord`와 실행 이력을 확인합니다. 알림을 수동으로 한 번 검증하려면 SQL Editor에서 `select private.send_daily_metrics();`를 실행할 수 있습니다. 같은 전일 데이터는 중복 발송되지 않습니다.

방 세부 지표는 전일 생성된 방이 0개이면 메시지에서 생략합니다. 활성 방은 전일 생성된 방 중 비관리자 메시지가 오갔고, 전일 종료 시점까지 비관리자 참여자가 2명 이상이었던 방으로 집계합니다. 금일 합승은 메시지가 오갔고 참여자가 2명 이상이었던 방에서 나갈 때 `boarded = true`로 응답한 건수입니다. 금일 방문 유저는 인증된 페이지 방문 이력(`user_visit_events`) 기준이며, MAU는 출발지 하단 시트 조회 이력(`location_sheet_view_events`) 기준 최근 30일의 고유 유저 수입니다. TOP3는 2026-06-15부터 기준일까지의 누적 방 입장 횟수로 정렬하고, 동률이면 최근 방문일이 가까운 유저를 우선합니다.

## 배포 전 체크리스트

- `npm run lint`
- `npm run build`
- 모바일 viewport에서 랜딩 텍스트가 잘리지 않는지 확인
- Google OAuth 로그인/회원가입 확인
- 새 지점 `제3기숙사`, `제2기숙사`로 방 생성/목록 조회 확인
- 방 참여/메시지 전송 확인
- `/debug`, `/reset-password`가 빌드 결과에 포함되지 않는지 확인

## 실기기 QA

프로덕션 배포 후 다음 경로를 우선 테스트합니다.

- 홈 랜딩
- 로그인
- 회원가입 프로필 입력
- 출발지/도착지 선택
- 방 생성
- 방 참여
- 채팅 메시지 전송
- 설정 화면
