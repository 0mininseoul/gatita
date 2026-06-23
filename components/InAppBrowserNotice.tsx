'use client'

import { useEffect, useState } from 'react'
import {
  IN_APP_BROWSER_ANDROID_GUIDE,
  IN_APP_BROWSER_IOS_GUIDE,
  IN_APP_BROWSER_NOTICE_TITLE,
  detectInAppBrowser,
} from '@/lib/auth'

// 에브리타임 등 인앱 브라우저에서는 Google OAuth가 차단되므로(403 disallowed_useragent),
// 두 줄짜리 컴팩트한 안내만 노출한다. 첫 줄(원인) + 둘째 줄(외부 브라우저로 여는 방법).
export default function InAppBrowserNotice() {
  const [info, setInfo] = useState({ isInApp: false, isIOS: false })

  useEffect(() => {
    const detected = detectInAppBrowser()
    setInfo({ isInApp: detected.isInApp, isIOS: detected.isIOS })
  }, [])

  if (!info.isInApp) return null

  const guide = info.isIOS ? IN_APP_BROWSER_IOS_GUIDE : IN_APP_BROWSER_ANDROID_GUIDE

  return (
    <div
      role="alert"
      style={{
        width: '100%',
        maxWidth: '360px',
        margin: '0 auto 1rem',
        padding: '0.625rem 0.875rem',
        borderRadius: '10px',
        background: 'rgba(255, 255, 255, 0.96)',
        borderLeft: '3px solid #f59e0b',
        boxShadow: '0 6px 18px rgba(17, 24, 39, 0.12)',
        textAlign: 'left',
      }}
    >
      <p style={{ fontWeight: 800, color: '#111827', fontSize: '0.9375rem', lineHeight: 1.4 }}>
        {IN_APP_BROWSER_NOTICE_TITLE}
      </p>
      <p style={{ marginTop: '0.125rem', fontWeight: 500, color: '#4b5563', fontSize: '0.8125rem', lineHeight: 1.45 }}>
        {guide}
      </p>
    </div>
  )
}
