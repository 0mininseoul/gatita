export const metadata: Metadata = {
  // 기본 메타데이터 (수정 없음)
  title: '같이타 - 가천대 통학 동행 플랫폼',
  description: '가천대학교 학생들을 위한 통학 경로 동행자 매칭 서비스입니다. 가천대역에서 AI공학관까지 안전하고 편리하게 함께 이동하세요.',
  keywords: '가천대, 통학, 동행, 플랫폼, 가천대역, AI공학관, 가천대학교',
  authors: [{ name: '박영민' }],
  creator: '같이타',
  
  // 아이콘 및 매니페스트 (수정 없음)
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  
  // Open Graph (OG) 태그 - ✨ 여기가 중요합니다 ✨
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: 'https://gatita-0minseouls-projects.vercel.app', // 대표 URL
    siteName: '같이타',
    title: '같이타 : 가천대 통학 동행 플랫폼', // 🚀 수정: 간결하게
    description: '가천대역에서 AI공학관까지, 안전하고 편리하게 함께 이동하세요!', // 🚀 수정: 간결하게
    images: [
      {
        url: 'https://gatita-0minseouls-projects.vercel.app/og-image.png', // 🚀 수정: 이중 https:// 제거
        width: 1200,
        height: 630,
        alt: '같이타 로고', // 🚀 수정: 간결하게
      },
    ],
  },
  
  // 트위터 카드 (함께 수정)
  twitter: {
    card: 'summary_large_image',
    title: '같이타 : 가천대 통학 동행 플랫폼', // 🚀 수정: OG와 일치
    description: '가천대역에서 AI공학관까지, 안전하고 편리하게 함께 이동하세요!', // 🚀 수정: OG와 일치
    images: ['https://gatita-0minseouls-projects.vercel.app/og-image.png'], // 🚀 수정: 프로덕션 URL로 통일
  },
  
  // 기타 정보 (수정 없음)
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '같이타',
  },
}
