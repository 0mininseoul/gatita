# 같이타 서비스 컨텍스트

Last updated: 2026-06-17

이 문서는 같이타를 다시 개발해 나가면서 계속 갱신할 기준 문서다. 제품 의도, 현재 구조, 운영 환경, 리팩토링 판단 근거를 한곳에 모아 이후 작업의 컨텍스트 손실을 줄인다.

## 제품 목적

같이타는 가천대학교 학생들이 정해진 통학 지점 사이를 함께 이동할 사람을 찾고, 방 안에서 실시간으로 대화할 수 있게 하는 모바일 우선 웹 앱이다.

초기 핵심 사용자는 가천대학교 이메일을 가진 학생이다. 서비스는 결제, 정산, 계좌 공유를 직접 다루지 않고, 동행자 탐색과 채팅에 집중한다.

## 현재 운영 환경

- Production URL: `https://gatitagachon.vercel.app/`
- Vercel project: `0minseouls-projects/gatita`
- Supabase project: `GATITA-new`
- Supabase ref: `hggpwrtasyngpjcbwjzg`
- Supabase region: `ap-northeast-2`
- Auth provider: Google OAuth
- Allowed email domain in app logic: `@gachon.ac.kr`
- Local Google OAuth credential file: `.secrets/google-oauth-client-secret.json`
- Brand logo source: `public/brand/gatita-logo.png`
- Public policy URLs: `/privacy`, `/terms`
- Google Search Console verification files: `public/googlecbd9b79f0d2eedb4.html`, `public/google938c92375e156b37.html`

비밀값은 레포에 커밋하지 않는다. `.env.local`, `.vercel/`, `.secrets/`, `supabase/.temp/`는 로컬/운영 연결용으로만 사용한다.

## 기술 스택

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- Paperlogy local font via `next/font/local`
- Supabase Auth, Postgres, Realtime
- Vercel
- PWA manifest/service worker는 존재하지만 현재 제품 기능으로 완성된 상태는 아니다.

## 주요 화면

- `/`: 비로그인 랜딩, 로그인 후 홈 대시보드
- `/rooms`: 경로별 채팅방 목록 및 방 생성
- `/rooms/[id]`: 실시간 채팅방
- `/settings`: 사용자 프로필 설정
- `/admin`: 관리자 대시보드
- `/privacy`: 개인정보처리방침
- `/terms`: 서비스약관

운영 노출 방지를 위해 `/debug`와 Google OAuth 정책에 맞지 않는 `/reset-password`는 제거했다.

## 현재 데이터 모델

주요 테이블은 `supabase_schema.sql` 기준 다음과 같다.

- `users`: Supabase Auth 사용자와 연결된 서비스 프로필
- `chat_rooms`: 출발지, 도착지, 출발 날짜/시간, 생성자, 상태
- `room_participants`: 방 참여자 및 확정 여부
- `messages`: 방별 채팅 메시지
- `reports`: 신고 내역
- `favorites`: 자주 쓰는 경로

고정 지점은 현재 여섯 가지다.

- `가천대역_1번출구`
- `가천대학교_정문`
- `교육대학원`
- `제3기숙사`
- `제2기숙사`
- `AI공학관`

## 현재 인증 흐름

1. 사용자가 Google OAuth로 로그인한다.
2. 앱이 이메일이 `@gachon.ac.kr`로 끝나는지 클라이언트에서 확인한다.
3. `users` 프로필이 없으면 이름, 전화번호, 닉네임, 학과를 입력받아 `users` row를 생성한다.
4. 프로필이 있으면 홈 화면으로 진입한다.

로그아웃 랜딩의 CTA는 `Google로 3초 안에 시작하기` 단일 버튼이다. CTA 위에는 `가천대학교 계정만 로그인 가능` 말풍선을 반복 모션으로 노출한다. OAuth `redirectTo`는 `/auth/callback`으로 보내고, 해당 Route Handler가 `exchangeCodeForSession(code)`으로 Supabase 세션 쿠키를 저장한 뒤 루트로 돌려보낸다. 이 방식은 iOS Safari에서 루트 페이지의 클라이언트 JS가 PKCE code exchange를 놓쳐 로그인 후 다시 랜딩으로 돌아오는 문제를 줄이기 위한 구조다. Google OAuth 요청에는 `hd=gachon.ac.kr` 힌트를 함께 보낸다. 이 값은 계정 선택 보조용일 뿐 강제 정책이 아니므로, callback과 클라이언트가 세션 이메일이 `@gachon.ac.kr`로 끝나는지 다시 확인한다. 다른 도메인의 Google 계정이면 즉시 로그아웃시키고 `가천대학교 계정이 아니라서 로그인이 실패했습니다.` 안내를 토스트와 랜딩 화면에 표시한다. callback 성공 후 기존 가입자는 `auth=complete` 플래그로 홈 화면까지 바로 진입하고, 신규 가입자는 가입 보완 화면으로 이동한다.

현재 프로필 생성은 클라이언트에서 직접 수행한다. DB 트리거나 서버 API가 프로필 생성 책임을 갖고 있지 않다.

## 현재 확인된 리스크

### P0: 데이터 접근 정책과 앱 기대 동작 불일치

`users` 테이블 조회 정책이 넓어 일반 사용자가 필요한 이상으로 프로필 데이터를 읽을 가능성이 있다. 1차 안정화에서는 클라이언트의 `NEXT_PUBLIC_ADMIN_EMAIL` fallback을 제거했고, 관리자 권한은 `users.is_admin = true`만 인정한다. 사용자 공개 프로필 분리는 후속 과제로 남긴다.

### P0: 방 참여 정원/생성/삭제가 클라이언트 책임

방 생성 후 참여자 row 삽입이 별도 요청으로 처리된다. 두 번째 요청이 실패하면 생성자 없는 방이 남을 수 있다. 정원 제한도 클라이언트에서만 검사하므로 동시 참여 시 최대 인원을 초과할 수 있다.

### 반영됨: Google OAuth 전환 후 남은 레거시 기능

`reset-password`는 현재 Google OAuth 전용 흐름과 맞지 않아 제거했다.

### P1: PWA/푸시 알림은 미완성 상태

manifest와 service worker의 아이콘 경로는 실제 파일 위치에 맞췄다. 푸시 알림은 더미 VAPID 키와 미구현 백엔드에 의존하므로 1차 안정화에서는 제거했다.

### P1: 모바일 UI 품질

모바일 첫 화면 내비게이션 텍스트의 고정 폭 문제는 수정했다. 주요 화면은 모바일 우선으로 계속 QA해야 한다.

### P2: 관측성/테스트 부족

현재 테스트 러너가 없고, 검증은 lint/build와 수동 QA에 의존한다. 핵심 플로우는 Playwright smoke test 또는 최소한 체크리스트 기반 QA가 필요하다.

## 승인 필요한 제품/기술 결정

### 1. 초기 재런칭 범위

결정: Google OAuth 가입, 방 목록/생성/참여, 채팅, 설정의 핵심 경로를 먼저 안정화한다. 관리자, 신고, PWA 푸시는 후속 단계로 분리한다.

### 2. 전화번호 수집 여부

권장안: 전화번호는 MVP에서 필수 수집하지 않거나, 최소한 공개/사용 목적을 명확히 한 뒤 유지한다. 현재는 PII 부담은 큰데 제품 흐름에서 직접 쓰이지 않는다.

대안: 전화번호를 필수로 유지한다. 이 경우 접근 정책, 관리자 열람 정책, 개인정보 안내가 같이 필요하다.

### 3. 관리자 권한 모델

결정: `users.is_admin = true`만 관리자 권한으로 인정한다. 공개 환경변수 기반 관리자 판정은 제거했다.

### 4. PWA 범위

결정: 이번 안정화에서는 manifest/icon 경로만 고치고 service worker의 공격적인 캐싱과 푸시 알림 코드는 비활성화한다.

## 제안 리팩토링 순서

1. 운영 설정 정리: stale URL, sitemap, metadata, debug route, README/DEPLOYMENT 정리
2. 인증 정리: Google OAuth 전용 흐름으로 `LoginForm`, `SignupForm`, 홈 진입 로직 단순화
3. DB 정책 정리: RLS, grants, indexes, admin 정책, 방 참여 정원 보장, 스키마 파일 최신화
4. 핵심 화면 안정화: 모바일 홈, 방 목록, 방 생성, 채팅방, 설정
5. 관리자/신고 재정의: 서버 API 또는 Supabase RPC로 권한 있는 작업만 수행
6. 검증 추가: lint/build, Playwright 모바일 smoke test, 프로덕션 배포 후 실기기 QA 체크리스트

## 현재 검증 상태

- `npm run lint`: 통과
- `npm run build`: 통과
- OAuth URL 생성 검사: `provider=google`, `hd=gachon.ac.kr`, `redirect_to=https://gatitagachon.vercel.app/auth/callback` 확인
- 로컬 callback route 검사: `/auth/callback`에 code 없이 접근 시 루트로 오류 안내 redirect 확인
- 모바일 Playwright viewport `390x844`: 비가천대 계정 실패 안내 UI 확인
- 로컬 개발 서버: `http://127.0.0.1:3000`
- 모바일 Playwright viewport `390x844`: 랜딩/회원가입 진입 확인
- Vercel 환경변수: 새 Supabase 프로젝트 값으로 업데이트됨
- Supabase migrations: 원격 적용 완료
- Supabase security advisors: `No issues found`
- Production은 이번 커밋 push 후 Vercel 자동배포로 최신 `NEXT_PUBLIC_*` 값을 포함해야 한다.

## 다음 작업 메모

- Supabase performance advisors에는 RLS `auth.uid()` initplan 최적화 경고가 남을 수 있다. 보안 경고는 해소했다.
- 기존 inactive Supabase 프로젝트 백업은 현재 코드 재개에는 필수로 보이지 않는다. 과거 사용자/채팅 데이터 복원이 필요해지면 별도 백업 다운로드 후 마이그레이션 계획을 세운다.
