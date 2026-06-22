# 같이타

가천대학교 학생을 위한 모바일 우선 통학 동행 웹 앱입니다. Google OAuth로 가천대학교 계정을 확인하고, 정해진 지점 사이의 동행 채팅방을 만들거나 참여할 수 있습니다.

## 현재 운영 환경

- Production: `https://gatita.kro.kr/`
- Frontend: Next.js 14, TypeScript, Tailwind CSS
- Backend: Supabase Auth, Postgres, Realtime
- Deploy: Vercel
- Auth: Google OAuth, `@gachon.ac.kr` 이메일만 허용

## 핵심 기능

- Google OAuth 기반 가입/로그인
- 이름, 전화번호, 닉네임, 학과 기반 서비스 프로필 생성
- 고정 지점 간 채팅방 목록/생성/참여
- Supabase Realtime 기반 채팅
- 자주 쓰는 경로 즐겨찾기
- 닉네임 변경이 가능한 설정 화면

## 고정 지점

- 가천대역 1번출구
- 가천대학교 정문
- 교육대학원
- 제3기숙사
- 제2기숙사
- AI공학관

## 로컬 개발

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 환경변수

`.env.local`을 만들고 Supabase 값을 설정합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
NEXT_PUBLIC_KAKAO_MAP_APP_KEY=your-kakao-javascript-key-here
```

서버 전용 작업이 생기기 전까지 `SUPABASE_SERVICE_ROLE_KEY`는 로컬/배포 환경에 필수는 아닙니다. 클라이언트 코드에서 service role key를 절대 사용하지 않습니다.
카카오맵은 Kakao Developers에서 발급한 JavaScript 키를 사용합니다. 개발/운영 도메인을 카카오 앱 플랫폼에 등록해야 실제 지도가 표시됩니다.

## Supabase 설정

1. Supabase 프로젝트를 생성합니다.
2. `supabase_schema.sql`을 SQL Editor에서 실행하거나 `supabase/migrations`를 적용합니다.
3. Authentication > Providers > Google을 활성화합니다.
4. Google Cloud Console의 Authorized Redirect URI에 Supabase callback URL을 등록합니다.

```text
https://your-project-id.supabase.co/auth/v1/callback
```

앱은 OAuth 완료 후 `/?mode=login` 또는 `/?mode=signup`으로 돌아옵니다.

## 주요 경로

- `/`: 랜딩 및 로그인 후 홈
- `/rooms`: 경로별 채팅방 목록과 생성
- `/rooms/[id]`: 채팅방 상세 및 실시간 채팅
- `/settings`: 내 프로필 설정
- `/admin`: 관리자 화면. 1차 안정화 범위 밖이며 `users.is_admin = true` 사용자만 접근 가능합니다.

## 검증

```bash
npm run lint
npm run build
```

실기기 테스트 전에는 모바일 viewport에서 홈, Google OAuth, 회원가입, 방 생성, 방 참여, 메시지 전송, 설정 화면을 확인합니다.

## 개발 컨텍스트

지속적으로 업데이트할 서비스 컨텍스트는 [docs/SERVICE_CONTEXT.md](docs/SERVICE_CONTEXT.md)에 정리합니다.
