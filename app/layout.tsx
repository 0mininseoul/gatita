import './globals.css'
import localFont from 'next/font/local'
import { Toaster } from 'react-hot-toast'
import { Metadata, Viewport } from 'next'
import AnalyticsProvider from '@/components/AnalyticsProvider'
import { SpeedInsights } from '@vercel/speed-insights/next'

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
const siteUrl = 'https://gatita.kro.kr'
const SPLASH_ASSET_VERSION = '20260621-01'
const splashImageUrl = (fileName: string) => `/splash/${fileName}.png?v=${SPLASH_ASSET_VERSION}`

// Next emits these entries as <link rel="apple-touch-startup-image"> tags for iOS PWAs.
const iosStartupImages = [
  {
    url: splashImageUrl('iphone-17-pro-max'),
    media: 'screen and (device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    url: splashImageUrl('iphone-17-air'),
    media: 'screen and (device-width: 420px) and (device-height: 912px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    url: splashImageUrl('iphone-17-pro'),
    media: 'screen and (device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    url: splashImageUrl('iphone-15-pro-max'),
    media: 'screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    url: splashImageUrl('iphone-14'),
    media: 'screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    // 393×852: iPhone 14 Pro / 15 / 15 Pro / 16 (가장 흔한 누락 크기 — 흰 화면 원인)
    url: splashImageUrl('iphone-15'),
    media: 'screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    // 428×926: iPhone 12/13 Pro Max, 14 Plus
    url: splashImageUrl('iphone-14-plus'),
    media: 'screen and (device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    // 360×780: iPhone 12 mini / 13 mini
    url: splashImageUrl('iphone-13-mini'),
    media: 'screen and (device-width: 360px) and (device-height: 780px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    url: splashImageUrl('iphone-xs-max'),
    media: 'screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    url: splashImageUrl('iphone-xr'),
    media: 'screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  },
  {
    url: splashImageUrl('iphone-x'),
    media: 'screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    url: splashImageUrl('iphone-8-plus'),
    media: 'screen and (device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    url: splashImageUrl('iphone-se'),
    media: 'screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  },
  {
    url: splashImageUrl('iphone-5'),
    media: 'screen and (device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  },
]

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: '같이타 - 가천대 택시 동승 플랫폼',
  description: '가천대학교 학생들을 위한 택시 동승자 찾기 서비스입니다. 가천대역에서 기숙사까지 안전하고 편리하게 함께 이동하세요.',
  keywords: '가천대, 택시, 동승, 플랫폼, 가천대역, 기숙사, 가천대학교',
  authors: [{ name: '같이타' }],
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
    title: '같이타 : 가천대 택시 동승 플랫폼',
    description: '가천대역에서 기숙사까지, 택시를 함께 이용할 동승자를 찾아보세요!',
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
    title: '같이타 : 가천대 택시 동승 플랫폼',
    description: '가천대역에서 기숙사까지, 택시를 함께 이용할 동승자를 찾아보세요!',
    images: ['/og-image.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '같이타',
    startupImage: iosStartupImages,
  },
  other: {
    'color-scheme': 'only light',
    'supported-color-schemes': 'light',
    'format-detection': 'telephone=no, date=no, address=no, email=no',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lock page scale so iOS Safari doesn't auto-zoom when focusing sub-16px inputs.
  // The Kakao map keeps its own pinch/zoom gestures, so map zoom is unaffected.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#ffffff',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className={paperlogy.variable} style={{ colorScheme: 'only light' }}>
      <head>
        <link rel="preconnect" href="https://dapi.kakao.com" />
        <link rel="preconnect" href="https://t1.daumcdn.net" crossOrigin="" />
      </head>
      <body className="antialiased">
        <div id="root" className="min-h-screen app-bg">
          {children}
        </div>
        <AnalyticsProvider />
        <Toaster
          position="top-center"
          containerStyle={{
            top: 'max(1rem, calc(env(safe-area-inset-top) + 0.875rem))',
          }}
          toastOptions={{
            duration: 800,
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
        <SpeedInsights />
      </body>
    </html>
  )
}
