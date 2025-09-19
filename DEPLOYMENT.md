# 🚀 "같이타" 배포 가이드

## 1. 사전 준비

### 필요한 계정
- [GitHub](https://github.com) - 코드 저장소
- [Supabase](https://supabase.com) - 데이터베이스 및 백엔드
- [Vercel](https://vercel.com) - 프론트엔드 배포

### 필요한 파일 (추가로 준비해야 함)
```
public/
├── favicon.ico          # 16x16 favicon
├── apple-touch-icon.png # 180x180 Apple 터치 아이콘
├── icon-72x72.png       # 72x72 PWA 아이콘
├── icon-96x96.png       # 96x96 PWA 아이콘
├── icon-128x128.png     # 128x128 PWA 아이콘
├── icon-144x144.png     # 144x144 PWA 아이콘
├── icon-152x152.png     # 152x152 PWA 아이콘
├── icon-192x192.png     # 192x192 PWA 아이콘
├── icon-384x384.png     # 384x384 PWA 아이콘
└── icon-512x512.png     # 512x512 PWA 아이콘
```

## 2. GitHub 저장소 생성

1. GitHub에서 새 private 저장소 생성
2. 로컬에서 코드 push:

```bash
git init
git add .
git commit -m "Initial commit: 같이타 v1.0.0"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/gaji-ta.git
git push -u origin main
```

## 3. Supabase 설정

### 3.1 프로젝트 생성
1. [Supabase](https://supabase.com)에서 "New Project" 클릭
2. 조직 선택 (없으면 생성)
3. 프로젝트 정보 입력:
   - **Name**: `gaji-ta`
   - **Database Password**: 강력한 비밀번호 생성 (메모해두기!)
   - **Region**: `Northeast Asia (Seoul)`

### 3.2 데이터베이스 스키마 설정
1. Supabase 대시보드 → "SQL Editor" 클릭
2. "New Query" 클릭
3. `supabase_schema.sql` 파일의 전체 내용을 복사하여 붙여넣기
4. "Run" 버튼 클릭하여 실행

### 3.3 API 키 및 URL 확인
1. Supabase 대시보드 → "Settings" → "API" 클릭
2. 다음 정보를 메모:
   - **Project URL**: `https://your-project-id.supabase.co`
   - **anon public**: `eyJ...` (공개 키)
   - **service_role**: `eyJ...` (서비스 키, 비공개!)

## 4. Vercel 배포

### 4.1 Vercel에 GitHub 연결
1. [Vercel](https://vercel.com)에 GitHub 계정으로 로그인
2. "New Project" 클릭
3. GitHub에서 `gaji-ta` 저장소 선택
4. "Import" 클릭

### 4.2 환경변수 설정
**Important**: 절대로 GitHub에 환경변수를 커밋하지 마세요!

Vercel 프로젝트 설정에서 다음 환경변수를 추가:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
NEXT_PUBLIC_ADMIN_EMAIL=your-admin@gachon.ac.kr
```

### 4.3 배포 확인
1. "Deploy" 버튼 클릭
2. 빌드 완료 후 "Visit" 버튼으로 사이트 확인
3. Vercel에서 제공하는 도메인: `https://gaji-ta.vercel.app`

## 5. 기능 테스트

### 5.1 기본 기능 테스트
1. 회원가입 (가천대 이메일로)
2. 로그인
3. 채팅방 생성
4. 채팅방 참여
5. 실시간 채팅
6. 신고 기능
7. 설정 변경 (닉네임)

### 5.2 관리자 기능 테스트
1. 관리자 계정으로 로그인
2. `https://your-domain.com/admin` 접속
3. 사용자 관리, 신고 처리 등 테스트

## 6. PWA 확인

### 6.1 모바일에서 테스트
1. 모바일 브라우저에서 사이트 접속
2. "홈 화면에 추가" 옵션 확인
3. 알림 권한 요청 확인
4. 오프라인에서 작동 확인

## 7. 도메인 연결 (선택사항)

### 7.1 도메인 구매
- [Namecheap](https://namecheap.com) 또는 [GoDaddy](https://godaddy.com)에서 도메인 구매
- 추천: `gajita.kr` 또는 `gachon-gajita.com` 등

### 7.2 Vercel에 도메인 연결
1. Vercel 프로젝트 → "Settings" → "Domains"
2. 도메인 입력 후 "Add" 클릭
3. DNS 설정 안내에 따라 도메인 제공업체에서 설정
4. HTTPS 자동 적용 (24시간 소요)

## 8. 모니터링 설정

### 8.1 Supabase 모니터링
1. Supabase 대시보드에서 사용량 모니터링
2. 무료 플랜 한도:
   - Database: 500MB
   - Auth: 50,000 MAU
   - Edge Functions: 500,000 호출/월
   - Realtime: 200 동시 연결

### 8.2 Vercel 모니터링
1. Vercel 대시보드에서 성능 및 사용량 확인
2. 무료 플랜 한도:
   - Bandwidth: 100GB/월
   - Function Executions: 100GB-Hours/월
   - Build Minutes: 6,000분/월

## 9. 백업 및 보안

### 9.1 데이터베이스 백업
```sql
-- Supabase SQL Editor에서 주기적으로 실행
SELECT * FROM users;
SELECT * FROM chat_rooms;
-- 필요한 테이블들 백업
```

### 9.2 보안 체크리스트
- ✅ 환경변수가 GitHub에 노출되지 않았는지 확인
- ✅ Supabase RLS 정책이 올바르게 적용되었는지 확인
- ✅ 관리자 계정 이메일이 안전한지 확인
- ✅ Service Role Key가 안전하게 보관되는지 확인

## 10. 런칭 체크리스트

### 최종 확인사항
- [ ] 모든 기능이 정상 작동
- [ ] 모바일 반응형 디자인 확인
- [ ] PWA 설치 및 오프라인 기능 확인
- [ ] 관리자 페이지 접근 권한 확인
- [ ] 신고 시스템 작동 확인
- [ ] 실시간 채팅 지연시간 < 1초
- [ ] 가천대 이메일 인증 작동 확인

### 성능 최적화
- [ ] Lighthouse 점수 90+ 확인
- [ ] Core Web Vitals 최적화
- [ ] 이미지 최적화 (WebP 형식)
- [ ] 캐싱 정책 확인

## 11. 문제 해결

### 자주 발생하는 문제들

**1. Supabase 연결 실패**
```bash
# 환경변수 확인
echo $NEXT_PUBLIC_SUPABASE_URL
echo $NEXT_PUBLIC_SUPABASE_ANON_KEY
```

**2. 빌드 에러**
```bash
# 로컬에서 빌드 테스트
npm run build
```

**3. PWA 아이콘 오류**
- 모든 아이콘 파일이 `public/` 폴더에 있는지 확인
- 파일명이 `manifest.json`과 일치하는지 확인

**4. 실시간 채팅 안됨**
- Supabase Realtime 설정 확인
- 방화벽/네트워크 설정 확인

## 🎉 배포 완료!

축하합니다! "같이타" 서비스가 성공적으로 배포되었습니다.

사용자들에게 서비스를 홍보하고, 피드백을 받아 지속적으로 개선해보세요.

**배포된 서비스 URL**: `https://your-domain.com`

---

문제가 발생하면 GitHub Issues에 등록하거나 인스타그램 [@0_min._.00](https://instagram.com/0_min._.00)으로 연락주세요! 🚀
