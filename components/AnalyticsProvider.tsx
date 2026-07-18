'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { initAnalytics, trackEvent } from '@/lib/analytics/client'
import { registerServiceWorker } from '@/lib/pwa'

export default function AnalyticsProvider() {
  const pathname = usePathname()

  useEffect(() => {
    initAnalytics()
    // 푸시 알림 수신을 위해 서비스워커를 등록해 둔다.
    void registerServiceWorker()
  }, [])

  useEffect(() => {
    trackEvent('page_viewed', {
      page_path: pathname,
    })
  }, [pathname])

  return null
}

