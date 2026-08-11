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
