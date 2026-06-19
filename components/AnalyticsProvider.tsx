'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { initAnalytics, trackEvent } from '@/lib/analytics/client'

export default function AnalyticsProvider() {
  const pathname = usePathname()

  useEffect(() => {
    initAnalytics()
  }, [])

  useEffect(() => {
    trackEvent('page_viewed', {
      page_path: pathname,
    })
  }, [pathname])

  return null
}

