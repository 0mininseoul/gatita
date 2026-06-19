'use client'

import * as amplitude from '@amplitude/analytics-browser'
import { Identify } from '@amplitude/analytics-browser'

type AnalyticsValue = string | number | boolean | null | undefined
type AnalyticsProperties = Record<string, AnalyticsValue>
type SanitizedAnalyticsProperties = Record<string, string | number | boolean>

let initialized = false
let unavailable = false

function getDisplayMode() {
  if (typeof window === 'undefined') return 'server'
  if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone'
  return 'browser'
}

function sanitizeProperties(properties: AnalyticsProperties = {}): SanitizedAnalyticsProperties {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== null),
  ) as SanitizedAnalyticsProperties
}

function commonProperties(): AnalyticsProperties {
  if (typeof window === 'undefined') return {}

  return {
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    path: window.location.pathname,
    display_mode: getDisplayMode(),
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
  }
}

export function initAnalytics() {
  if (typeof window === 'undefined' || initialized || unavailable) return initialized

  const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY

  if (!apiKey) {
    unavailable = true
    return false
  }

  amplitude.init(apiKey, {
    autocapture: false,
    defaultTracking: false,
    remoteConfig: {
      fetchRemoteConfig: false,
    },
    trackingOptions: {
      ipAddress: false,
    },
  })

  initialized = true
  return true
}

export function trackEvent(eventName: string, properties: AnalyticsProperties = {}) {
  if (!initAnalytics()) return

  amplitude.track(eventName, sanitizeProperties({
    ...commonProperties(),
    ...properties,
  }))
}

export function identifyAnalyticsUser(
  userId: string | null | undefined,
  properties: AnalyticsProperties = {},
) {
  if (!initAnalytics()) return

  if (!userId) {
    amplitude.reset()
    return
  }

  amplitude.setUserId(userId)

  const identify = new Identify()
  Object.entries(sanitizeProperties(properties)).forEach(([key, value]) => {
    identify.set(key, value)
  })
  amplitude.identify(identify)
}
