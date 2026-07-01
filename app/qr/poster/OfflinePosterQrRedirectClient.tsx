'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { flushAnalytics, trackEvent } from '@/lib/analytics/client'
import {
  OFFLINE_POSTER_QR_CAMPAIGN,
  buildOfflinePosterDestinationPath,
  getOfflinePosterQrEventProperties,
} from '@/lib/marketing/qr'

const FLUSH_WAIT_MS = 450
const FALLBACK_REDIRECT_MS = 1400

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export default function OfflinePosterQrRedirectClient() {
  const router = useRouter()
  const hasStartedRef = useRef(false)

  useEffect(() => {
    if (hasStartedRef.current) return
    hasStartedRef.current = true

    let cancelled = false
    let fallbackTimeoutId: number | undefined

    const redirect = () => {
      if (cancelled) return
      router.replace(buildOfflinePosterDestinationPath())
    }

    fallbackTimeoutId = window.setTimeout(redirect, FALLBACK_REDIRECT_MS)

    void (async () => {
      trackEvent(OFFLINE_POSTER_QR_CAMPAIGN.eventName, getOfflinePosterQrEventProperties())
      await Promise.race([flushAnalytics(), wait(FLUSH_WAIT_MS)])

      if (fallbackTimeoutId !== undefined) {
        window.clearTimeout(fallbackTimeoutId)
      }
      redirect()
    })()

    return () => {
      cancelled = true
      if (fallbackTimeoutId !== undefined) {
        window.clearTimeout(fallbackTimeoutId)
      }
    }
  }, [router])

  return (
    <main className="flex min-h-dvh items-center justify-center bg-white px-6 text-center text-gray-900">
      <div className="space-y-3">
        <p className="text-lg font-semibold">같이타로 이동 중</p>
        <p className="text-sm text-gray-500">잠시만 기다려주세요.</p>
      </div>
    </main>
  )
}
