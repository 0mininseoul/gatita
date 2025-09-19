# 같이타 🚗

가천대학교 학생들을 위한 통학 경로 동행 커뮤니티 서비스

## 🎯 주요 기능

- **가천대 학생 인증**: 가천대 이메일로만 가입 가능
- **경로별 채팅방**: 4개 지점 간 이동 경로별 동행자 모집
- **실시간 채팅**: WebSocket 기반 실시간 소통
- **참여 확정 시스템**: 동행 의사 명확히 표시
- **신고 시스템**: 부적절한 사용자 신고 및 관리
- **PWA 지원**: 모바일에서 앱처럼 사용 가능

## 🛠 기술 스택

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Realtime + Auth)
- **PWA**: Service Worker, Web Push Notifications
- **배포**: Vercel (무료)

## 🚀 빠른 시작

### 1. 프로젝트 설정

```bash
# 저장소 클론
git clone <your-repo-url>
cd gaji-ta

# 의존성 설치
npm install
```

### 2. 환경변수 설정

`.env.local` 파일을 생성하고 다음 내용을 추가하세요:

```env
# Supabase 설정
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# 관리자 설정
NEXT_PUBLIC_ADMIN_EMAIL=your_admin_email@gachon.ac.kr
```

### 3. Supabase 설정

1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. `supabase_schema.sql` 파일의 내용을 SQL Editor에서 실행
3. Supabase 대시보드에서 프로젝트 URL과 API 키를 확인하여 환경변수에 설정

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

## 📱 PWA 설정

### 아이콘 파일 준비

`public/` 폴더에 다음 아이콘 파일들을 추가하세요:

- `icon-72x72.png`
- `icon-96x96.png`
- `icon-128x128.png`
- `icon-144x144.png`
- `icon-152x152.png`
- `icon-192x192.png`
- `icon-384x384.png`
- `icon-512x512.png`
- `favicon.ico`
- `apple-touch-icon.png`

### 푸시 알림 설정 (선택사항)

푸시 알림을 사용하려면:

1. VAPID 키 쌍 생성
2. `lib/pwa.ts`에서 `YOUR_VAPID_PUBLIC_KEY_HERE`를 실제 공개키로 교체
3. 백엔드에서 푸시 알림 발송 로직 구현

## 🏗 프로젝트 구조

```
├── app/                    # Next.js 13+ App Router
│   ├── admin/             # 관리자 대시보드
│   ├── rooms/             # 채팅방 관련 페이지
│   ├── settings/          # 설정 페이지
│   ├── globals.css        # 글로벌 스타일
│   ├── layout.tsx         # 루트 레이아웃
│   └── page.tsx           # 홈페이지
├── components/            # React 컴포넌트
│   └── auth/              # 인증 관련 컴포넌트
├── lib/                   # 유틸리티 및 설정
│   ├── supabase.ts        # Supabase 클라이언트
│   └── pwa.ts             # PWA 유틸리티
├── public/                # 정적 파일
│   ├── manifest.json      # PWA 매니페스트
│   ├── sw.js              # Service Worker
│   └── icons/             # 앱 아이콘들
└── package.json
```

## 📊 데이터베이스 스키마

주요 테이블:

- `users`: 사용자 정보
- `chat_rooms`: 채팅방 정보
- `room_participants`: 채팅방 참여자
- `messages`: 채팅 메시지
- `reports`: 신고 내역
- `favorites`: 즐겨찾기 경로

## 🔐 보안 및 권한

### Row Level Security (RLS)

모든 테이블에 RLS가 활성화되어 있습니다:

- 사용자는 자신의 데이터만 수정 가능
- 채팅방 참여자만 메시지 조회 가능
- 관리자만 신고 내역 조회 가능

### 관리자 권한

관리자는 다음과 같이 설정됩니다:

1. `users.is_admin = true` 또는
2. 이메일이 `NEXT_PUBLIC_ADMIN_EMAIL`과 일치

## 🚀 배포

### Vercel 배포

1. [Vercel](https://vercel.com)에 GitHub 저장소 연결
2. 환경변수 설정
3. 자동 배포 완료

### 커스텀 도메인 (선택사항)

1. 도메인 구매 (.com 약 $12/년)
2. Vercel에서 도메인 연결
3. HTTPS 자동 설정

## 💰 예상 운영비

- **사용자 1,000명 이하**: 완전 무료
- **사용자 5,000명 정도**: 월 $25-30 (Supabase Pro)
- **커스텀 도메인**: 연 $12 (선택사항)

## 🛡️ 법적 고려사항

이 서비스는 **정보 공유 커뮤니티**로 설계되었습니다:

- 직접적인 택시비 정산 기능 없음
- 계좌번호 수집/공개 안함
- 순수 매칭 및 소통 기능만 제공

## 📞 지원

문의사항은 인스타그램 [@0_min._.00](https://instagram.com/0_min._.00)으로 DM 주세요.

## 📄 라이선스

이 프로젝트는 가천대학교 학생들을 위한 비영리 목적으로 개발되었습니다.

## 🤝 기여

버그 발견이나 개선사항이 있으시면 이슈를 등록해 주세요.

---

**같이타**로 더 편리한 가천대 통학 생활을 만들어보세요! 🎓✨