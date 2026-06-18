import './globals.css'
import localFont from 'next/font/local'
import { Toaster } from 'react-hot-toast'
import { Metadata, Viewport } from 'next'

const paperlogy = localFont({
  src: [
    { path: './fonts/Paperlogy-1Thin.woff2', weight: '100', style: 'normal' },
    { path: './fonts/Paperlogy-2ExtraLight.woff2', weight: '200', style: 'normal' },
    { path: './fonts/Paperlogy-3Light.woff2', weight: '300', style: 'normal' },
    { path: './fonts/Paperlogy-4Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Paperlogy-5Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Paperlogy-6SemiBold.woff2', weight: '600', style: 'normal' },
    { path: './fonts/Paperlogy-7Bold.woff2', weight: '700', style: 'normal' },
    { path: './fonts/Paperlogy-8ExtraBold.woff2', weight: '800', style: 'normal' },
    { path: './fonts/Paperlogy-9Black.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-paperlogy',
  display: 'swap',
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
})
const siteUrl = 'https://gatitagachon.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: '같이타 - 가천대 통학 동행 플랫폼',
  description: '가천대학교 학생들을 위한 통학 경로 동행자 매칭 서비스입니다. 가천대역에서 AI공학관까지 안전하고 편리하게 함께 이동하세요.',
  keywords: '가천대, 통학, 동행, 플랫폼, 가천대역, AI공학관, 가천대학교',
  authors: [{ name: '박영민' }],
  creator: '같이타',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: siteUrl,
    siteName: '같이타',
    title: '같이타 : 가천대 통학 동행 플랫폼',
    description: '가천대역에서 AI공학관까지, 안전하고 편리하게 함께 이동하세요!',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 1200,
        alt: '같이타 로고',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '같이타 : 가천대 통학 동행 플랫폼',
    description: '가천대역에서 AI공학관까지, 안전하고 편리하게 함께 이동하세요!',
    images: ['/og-image.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '같이타',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2782ff',
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className={paperlogy.variable}>
      <body className="antialiased">
        <div id="root" className="min-h-screen app-bg">
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
