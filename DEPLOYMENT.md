# 같이타 배포 메모

## 현재 배포 대상

- Production URL: `https://gatitagachon.vercel.app/`
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

앱 도메인 `https://gatitagachon.vercel.app`은 Google OAuth JavaScript origin에 등록합니다.

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
