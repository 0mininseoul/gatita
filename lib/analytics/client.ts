'use client'

import * as amplitude from '@amplitude/analytics-browser'
import { Identify } from '@amplitude/analytics-browser'
import { sessionReplayPlugin } from '@amplitude/plugin-session-replay-browser'

type AnalyticsValue = string | number | boolean | null | undefined
type AnalyticsProperties = Record<string, AnalyticsValue>
type SanitizedAnalyticsProperties = Record<string, string | number | boolean>

const INTERNAL_DEVICE_STORAGE_KEY = 'gatita:analytics-internal-device'

let initialized = false
let unavailable = false

function getSessionReplaySampleRate() {
  // 0~1 사이로 환경변수로 조정 가능. 미설정 시 100% 수집(소규모 앱 기준).
  const raw = Number(process.env.NEXT_PUBLIC_AMPLITUDE_SESSION_REPLAY_SAMPLE_RATE)
  if (Number.isFinite(raw) && raw >= 0 && raw <= 1) return raw
  return 1
}

function parseEnvList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function isCurrentDeviceSuppressed() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(INTERNAL_DEVICE_STORAGE_KEY) === 'true'
}

function syncOptOutState() {
  if (!initialized) return
  amplitude.setOptOut(isCurrentDeviceSuppressed())
}

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

  // 세션 리플레이 플러그인은 init 이전에 등록해야 한다.
  // 이 앱은 전화번호·계좌·이메일 등 PII를 다루므로 모든 입력 필드를 마스킹한다.
  amplitude.add(
    sessionReplayPlugin({
      sampleRate: getSessionReplaySampleRate(),
      privacyConfig: {
        defaultMaskLevel: 'medium',
      },
    }),
  )

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
  syncOptOutState()
  return true
}

export function trackEvent(eventName: string, properties: AnalyticsProperties = {}) {
  if (!initAnalytics()) return
  if (isCurrentDeviceSuppressed()) return

  amplitude.track(eventName, sanitizeProperties({
    ...commonProperties(),
    ...properties,
  }))
}

export function suppressAnalyticsForCurrentDevice() {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(INTERNAL_DEVICE_STORAGE_KEY, 'true')
  if (initAnalytics()) {
    amplitude.setOptOut(true)
  }
}

export function shouldSuppressAnalyticsForUser(user: {
  userId?: string | null
  email?: string | null
  isAdmin?: boolean | null
}) {
  if (user.isAdmin) return true

  const excludedUserIds = parseEnvList(process.env.NEXT_PUBLIC_ANALYTICS_EXCLUDED_USER_IDS)
  const excludedEmails = parseEnvList(process.env.NEXT_PUBLIC_ANALYTICS_EXCLUDED_EMAILS)

  const userId = user.userId?.trim().toLowerCase()
  const email = user.email?.trim().toLowerCase()

  return Boolean(
    (userId && excludedUserIds.includes(userId))
    || (email && excludedEmails.includes(email)),
  )
}

export function identifyAnalyticsUser(
  userId: string | null | undefined,
  properties: AnalyticsProperties = {},
) {
  if (!initAnalytics()) return

  if (properties.is_admin === true || isCurrentDeviceSuppressed()) {
    suppressAnalyticsForCurrentDevice()
    return
  }

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
