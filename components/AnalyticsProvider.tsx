'use client'

import { useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { initAnalytics, trackEvent } from '@/lib/analytics/client'
import { resolveAuthFailureRecovery } from '@/lib/authRecovery'
import { registerServiceWorker } from '@/lib/pwa'

const VISIT_RETRY_DELAYS_MS = [0, 250, 750, 1500, 3000, 5000] as const

export default function AnalyticsProvider() {
  const pathname = usePathname()
  const supabase = useMemo(() => {
    try {
      return createClient()
    } catch (error) {
      console.error('Supabase client creation error:', error)
      return null
    }
  }, [])

  useEffect(() => {
    initAnalytics()
    // 푸시 알림 수신을 위해 서비스워커를 등록해 둔다.
    void registerServiceWorker()
  }, [])

  useEffect(() => {
    trackEvent('page_viewed', {
      page_path: pathname,
    })

    // Amplitude는 제품 분석용이고, 서버에도 인증된 페이지 방문 이벤트를
    // 남겨 둔다. Discord Metrics의 일일 방문자 집계에 사용한다.
    let cancelled = false

    const recordVisit = async () => {
      if (!supabase) return

      for (const delayMs of VISIT_RETRY_DELAYS_MS) {
        if (delayMs > 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs))
        }

        if (cancelled) return

        const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
        if (cancelled) return
        if (!session?.user) continue

        try {
          const response = await fetch('/api/analytics/visit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: pathname }),
            keepalive: true,
          })

          if (response.ok) return
          // 서버가 세션을 거부했다면 재시도해도 401만 반복된다. 그 재시도 하나하나가
          // 인증 미들웨어를 다시 타면서 만료된 토큰으로 리프레시를 시도하므로,
          // 세션 회전 경합을 키울 뿐이다.
          if (resolveAuthFailureRecovery(response.status) === 'sign_out') return
        } catch {
          // 인증 쿠키 동기화나 일시적인 네트워크 문제일 수 있으므로 재시도한다.
        }
      }
    }

    void recordVisit()

    return () => {
      cancelled = true
    }
  }, [pathname, supabase])

  return null
}
