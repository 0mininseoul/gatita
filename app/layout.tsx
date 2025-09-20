import './globals.css'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import { Metadata, Viewport } from 'next'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '같이타 - 가천대 통학 동행 플랫폼',
  description: '가천대학교 학생들을 위한 통학 경로 동행자 매칭 서비스입니다. 가천대역에서 AI공학관까지 안전하고 편리하게 함께 이동하세요.',
  keywords: '가천대, 통학, 동행, 플랫폼, 가천대역, AI공학관, 가천대학교',
  authors: [{ name: '박영민' }],
  creator: '같이타',
  publisher: '같이타',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '같이타',
  },
  // Open Graph 태그
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: 'https://gatita-0minseouls-projects.vercel.app',
    siteName: '같이타',
    title: '같이타 - 가천대 통학 동행 플랫폼',
    description: '가천대학교 학생들을 위한 통학 경로 동행자 매칭 서비스입니다. 가천대역에서 AI공학관까지 안전하고 편리하게 함께 이동하세요.',
    images: [
      {
        url: 'https://https://gatita-0minseouls-projects.vercel.app/og-image.png',
        width: 1200,
        height: 630,
        alt: '같이타 - 가천대 통학 동행 플랫폼',
      },
    ],
  },
  // Twitter 카드
  twitter: {
    card: 'summary_large_image',
    site: '@gatita_official',
    creator: '@gatita_official',
    title: '같이타 - 가천대 통학 동행 플랫폼',
    description: '가천대학교 학생들을 위한 통학 경로 동행자 매칭 서비스입니다.',
    images: ['https://gatita-rosy.vercel.app/og-image.png'],
  },
  // 추가 메타 태그
  other: {
    'apple-mobile-web-app-title': '같이타',
    'application-name': '같이타',
    'msapplication-TileColor': '#3b82f6',
    'theme-color': '#3b82f6',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#3b82f6',
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body className={`${inter.className} antialiased`}>
        <div id="root" className="min-h-screen bg-gray-50">
          {children}
        </div>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#ffffff',
              color: '#1f2937',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              fontSize: '14px',
              padding: '12px 16px',
              maxWidth: '400px',
            },
            success: {
              iconTheme: {
                primary: '#10b981',
                secondary: '#ffffff',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#ffffff',
              },
            },
          }}
        />
      </body>
    </html>
  )
}
