# 유저 테이블 통합 + 가천 로그인 즉시 유저화 설계

- 날짜: 2026-06-22
- 대상 프로젝트: Supabase `GATITA-new` (`hggpwrtasyngpjcbwjzg`)
- 상태: 설계 승인됨 (사용자 확인 완료)

## 1. 배경 / 문제

Google OAuth 로그인 시 Supabase가 `auth.users` + `auth.identities`를 자동 생성하지만,
서비스 유저 레코드(`public.users`)는 **온보딩 폼 제출 시점에만** 앱 코드가 생성한다.
`auth.users` → `public.users` 자동 복제 트리거가 없다.

결과: 가천 계정으로 로그인했어도 온보딩을 완료하지 않으면 `public.users`에 없어
"유저"로 집계/참조되지 않는다.

실제 데이터(2026-06-22 기준, auth.users 4명):

| 이메일 | 가입 | public.users | 상태 |
|---|---|---|---|
| ym5373@gachon.ac.kr | 06-17 | O | 온보딩 완료 |
| toma12345@gachon.ac.kr | 06-19 | O | 온보딩 완료 |
| lss040228@gachon.ac.kr | 06-21 | X | 가천 로그인, 온보딩 미완료 |
| ascentumseoul@gmail.com | 06-21 | X | 비-가천 orphan |

추가로, 콜백이 비-가천 계정을 `signOut`만 하고 `auth.users`는 지우지 않아 orphan이 쌓인다
(gmail 케이스).

## 2. 목표 / 비목표

**목표**
- 가천(`@gachon.ac.kr`) 계정이 로그인하면 온보딩 전이라도 즉시 유저 레코드 보유 (집계/관리자 가시성).
- Google 로그인 정보(이름·이메일·avatar·학과)를 로그인 시점에 캡처해 한 유저당 정식 레코드 1세트 보장.
- 유저 정보 테이블을 3개 → 2개로 정리.

**비목표 (YAGNI)**
- 온보딩 미완료 유저의 실제 기능 사용(방 참여·채팅 등)은 **여전히 온보딩 완료가 게이트**. 기능 개방 없음.
- 닉네임 자동생성 / 온보딩 제거 안 함.
- 단일 테이블 + View 구조(C안) 미채택.

## 3. 프라이버시 경계 (확정)

- **공개**(다른 일반 유저도 볼 수 있음): `nickname`, `department`, `avatar_url`
- **비공개**(본인 + 관리자만): `email`, `name`(실명), `phone`, 계좌정보, 정지/관리 상태

## 4. 데이터 모델 (최종 2 테이블 + 로그 1)

### 4.1 `public.users` (공개 프로필)
인증 유저 누구나 SELECT. 로그인 시 트리거가 자동 생성.

| 컬럼 | 변경 | 비고 |
|---|---|---|
| `id` uuid PK | — | FK → auth.users.id |
| `nickname` varchar | **NOT NULL → NULLABLE** (unique 유지) | 로그인 시 NULL, 온보딩 때 채움 |
| `nickname_updated_at` timestamptz | — | |
| `department` varchar | NOT NULL → **NULLABLE** | 로그인 시 Google에서 자동 추출(추출 실패 가능성 대비 nullable) |
| `avatar_url` text | — | **로그인 시 자동 채움**(현재는 영영 NULL인 미사용 컬럼) |
| `created_at`, `updated_at` | — | |

### 4.2 `user_private_profiles` (비공개 프로필)
본인만 SELECT, write는 서버(admin) 전용. 로그인 시 트리거가 자동 생성.

| 컬럼 | 변경 | 비고 |
|---|---|---|
| `user_id` uuid PK | — | FK → users.id |
| `email` varchar unique | — | 로그인 시 `auth.users.email`로 자동 채움 |
| `name` varchar | NOT NULL → **NULLABLE** | 로그인 시 Google 실명 자동 채움 |
| `phone` varchar | NOT NULL → **NULLABLE** | 온보딩 때 |
| `phone_verified_at`, `phone_mfa_factor_id` | — | |
| `bank_name` varchar | **신규(payout 병합)** NULLABLE | 온보딩 때 |
| `account_number` varchar | **신규(payout 병합)** NULLABLE | 온보딩 때 |
| `account_holder` varchar | **신규(payout 병합)** NULLABLE | 온보딩 때 |
| `status`, `suspended_until`, `suspension_reason`, `moderation_updated_at` | — | |
| `is_admin` boolean | — | |
| **`onboarded_at` timestamptz** | **신규** NULLABLE | 온보딩 완료 판별의 단일 소스 |
| `created_at`, `updated_at` | — | |

### 4.3 제거 / 유지
- **제거**: `public.user_payout_accounts` (private로 병합 후 drop)
- **유지**: `public.user_moderation_actions` (제재 로그)

## 5. 로그인 시 자동 생성 (DB 트리거)

`auth.users` AFTER INSERT 트리거 `handle_new_user()` (SECURITY DEFINER, `search_path=public` 고정):

- `NEW.email`이 `@gachon.ac.kr`로 끝날 때만 동작 (비-가천은 row 생성 안 함 → orphan 방지)
- 메타데이터 추출(앱 `extractGachonProfileFromMetadata` 로직의 SQL 재현):
  - `display_name = coalesce(raw_user_meta_data->>'name', ->>'full_name', ->>'display_name')`
  - `name = trim(split_part(display_name, '/', 1))`
  - `department = nullif(trim(split_part(display_name, '/', 2)), '')`
  - `avatar = raw_user_meta_data->>'avatar_url'` (없으면 `->>'picture'`)
- `INSERT INTO public.users (id, nickname, department, avatar_url)` → `(NEW.id, NULL, department, avatar)`
- `INSERT INTO public.user_private_profiles (user_id, email, name, status, is_admin, onboarded_at)`
  → `(NEW.id, NEW.email, name, 'active', false, NULL)`
- 멱등성: 두 INSERT 모두 `ON CONFLICT DO NOTHING`

효과: "auth.users 있는데 public.users 없는" 불일치가 원천 차단된다.

## 6. 온보딩 완료 판별 전환 (`onboarded_at`)

자동생성으로 인해 "row 존재 여부" 기반 판별이 깨지므로 `onboarded_at`으로 전환.

### 6.1 `app/api/profile/me/route.ts`
- 현재: `profileCompleted = !!(publicProfile && privateProfile && payoutAccount)`
- 변경: `profileCompleted = !!privateProfile.onboarded_at`
- 응답 shape(`user` 객체 + `payoutAccount`)는 **유지** → 클라이언트 대규모 변경 불필요.
  - payout 필드는 private row에서 꺼내 기존 `payoutAccount` 모양(`{ user_id, bank_name, account_number, account_holder, created_at, updated_at }`)으로 조립.
  - 단, 미완료 유저는 `payoutAccount` 필드가 모두 NULL일 수 있으니 "은행 정보 존재" 판단은 `bank_name != null` 기준.

### 6.2 `app/api/profile/complete/route.ts`
- 현재: 3개 테이블에 INSERT/upsert.
- 변경: 로그인 시 row가 이미 있으므로 **UPDATE** 중심:
  - `public.users`: `nickname` (+ `nickname_updated_at`), 필요 시 `department` 보정
  - `user_private_profiles`: `name`, `phone`, `bank_name`, `account_number`, `account_holder`, `onboarded_at = now()`
- "이미 완료" 체크: 기존 `private && payout 존재` → **`onboarded_at IS NOT NULL`**
- 닉네임 중복 체크(기존 로직) 유지.
- 트리거 누락 등으로 row가 없는 방어: `upsert`로 처리(있으면 update, 없으면 insert).

### 6.3 `app/settings/page.tsx` (정산 계좌 수정)
- 현재: 클라이언트가 `user_payout_accounts`에 **직접 write** (line ~423).
- 문제: payout이 `user_private_profiles`로 병합되면 해당 테이블엔 `is_admin`/`status`가 있어
  유저에게 직접 UPDATE 권한을 줄 수 없다(컬럼 단위 RLS 불가).
- 변경: **신규 서버 라우트 `PATCH /api/profile/payout`** 추가.
  - 인증된 본인의 `bank_name/account_number/account_holder`만 admin 클라이언트로 update.
  - 계좌 유효성 검사(`isAccountNumberCompleteForBank` 등)는 서버에서 수행.
- settings 페이지의 계좌 read는 `/api/profile/me`의 `payoutAccount`를 계속 사용(변경 없음).

## 7. RLS

- `users`: 변경 없음 (authenticated SELECT `true`, 본인 UPDATE, INSERT 정책 없음 = 트리거/서버만).
- `user_private_profiles`: 본인 SELECT 유지. write 정책 없음(서버 admin 전용) 유지.
- `user_payout_accounts`의 본인 INSERT/UPDATE/SELECT 정책: 테이블 제거와 함께 **삭제**.
- 관리자 읽기/쓰기는 기존처럼 service-role(admin client)로 RLS 우회.
- 트리거 `handle_new_user`는 SECURITY DEFINER로 RLS 무관하게 INSERT.

## 8. 마이그레이션 순서

1. `public.users`: `nickname`, `department` `DROP NOT NULL`.
2. `user_private_profiles`: `name`, `phone` `DROP NOT NULL`; `bank_name`/`account_number`/`account_holder`/`onboarded_at` 컬럼 추가(nullable).
3. 기존 `user_payout_accounts` 데이터를 `user_private_profiles`로 복사(user_id 매칭 UPDATE).
4. `user_payout_accounts` 및 관련 RLS 정책 DROP.
5. `handle_new_user()` 함수 + `auth.users` AFTER INSERT 트리거 생성.
6. 백필(섹션 9) 실행.
7. 앱 코드 변경(섹션 6) 배포.
8. `supabase_schema.sql`(레포 내 canonical 스키마)과 `CLAUDE.md`의 "Signup Flow" 섹션 갱신.

> 주의: 7(코드)과 1~5(스키마)의 배포 순서. 스키마 먼저 적용하면 기존 `/complete`(INSERT 방식)는
> nullable 완화 덕에 깨지지 않고 동작 가능 → 스키마 먼저, 코드 나중 배포가 안전.

## 9. 백필 (5-3, 전체 진행)

- **ym5373, toma12345** (온보딩 완료): `private.onboarded_at = users.created_at` (역사적 정확성 위해 now() 대신 가입일 사용),
  `users.avatar_url`을 `auth.users.raw_user_meta_data->>'avatar_url'`(없으면 `->>'picture'`)로 백필.
- **lss040228** (가천, 미완료): 트리거 로직과 동일하게 `users` + `user_private_profiles` row 생성,
  `onboarded_at = NULL`.
- **ascentumseoul@gmail.com** (비-가천): **정리 대상** — `auth.users`/`auth.identities`에서 삭제
  (연결된 public row 없음). admin API(`auth.admin.deleteUser`) 또는 SQL로 삭제.

## 10. 선택적 하드닝 (이번 작업 포함)

- `app/auth/callback/route.ts`: 비-가천 로그인 시 `signOut`에 더해 admin으로 해당 `auth.users` 삭제
  → 향후 orphan auth 레코드 누적 근본 차단.

## 11. 엣지 케이스 / 검증

- `nickname` NULL 유저가 화면(예: 관리자 대시보드 유저 목록)에 노출될 때 표시 처리 확인
  (닉네임 없으면 실명/이메일 fallback). 일반 유저 화면엔 미완료 유저가 등장하지 않음(기능 게이트).
- 트리거 메타 추출 실패(이름에 `/` 없음) 시 `department = NULL` 허용됨.
- 마이그레이션은 라이브 데이터가 작음(유저 2~4명, rooms/messages 0행)이라 리스크 낮음.
- 검증: 마이그레이션 후 신규 가천 로그인 1건으로 `users` + `private` 자동 생성 확인,
  온보딩 완료로 `onboarded_at` 세팅 확인, settings 계좌 수정이 새 라우트로 동작 확인.

## 12. 영향 받는 파일 (예상)

- DB: 마이그레이션 SQL(스키마 변경 + 트리거 + 백필), RLS 정책 삭제.
- `app/api/profile/me/route.ts` (판별 로직 + payout 조립)
- `app/api/profile/complete/route.ts` (INSERT → UPDATE/upsert + onboarded_at)
- `app/api/profile/payout/route.ts` (신규)
- `app/settings/page.tsx` (계좌 write를 새 라우트로)
- `app/auth/callback/route.ts` (비-가천 auth 삭제 하드닝)
- `supabase_schema.sql`, `CLAUDE.md` (문서 동기화)
