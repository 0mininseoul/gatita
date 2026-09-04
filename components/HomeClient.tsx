'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  ChatRoom,
  getDepartureDateForTime,
  getRoomDepartureDateTime,
  getMapRoomDateRange,
  LOCATIONS,
  LocationType,
  ROUTE_TOO_CLOSE_MESSAGE,
  User,
  isRoomJoinable,
  isRoomVisibleOnMap,
  isRestrictedRoutePair,
} from '@/lib/supabase'
import {
  DUPLICATE_ROOM_MESSAGE,
  findDuplicateActiveRoom,
  getDuplicateRoomMessage,
  isDuplicateRoomFull,
} from '@/lib/duplicateRoom'
import { usePresenceDisplayCount } from '@/lib/usePresenceDisplayCount'
import { GACHON_ACCOUNT_HINT, NON_GACHON_ACCOUNT_MESSAGE, detectInAppBrowser, escapeInAppBrowser, extractGachonProfileFromMetadata, getGoogleOAuthOptions, isGachonEmail } from '@/lib/auth'
import { isInstalled } from '@/lib/pwa'
import { getNotificationPermission, isPushSupported, isSubscribedToPush, subscribeToPush } from '@/lib/push'
import { PREVIEW_TEST_ACCOUNTS, isPreviewTestLoginEnabled } from '@/lib/previewTestAccounts'
import { hasServiceShareIntent, removeServiceShareIntent, shareService } from '@/lib/serviceShare'
import { identifyAnalyticsUser, shouldSuppressAnalyticsForUser, suppressAnalyticsForCurrentDevice, trackEvent } from '@/lib/analytics/client'
import { shouldTrackAnonymousLanding } from '@/lib/analytics/landing'
import { ROUTES_SEEN_STORAGE_KEY } from '@/lib/routeSummary'
import { buildRepeatRoutePromptDismissKey, shouldPromptRepeatRouteSubscription } from '@/lib/repeatRoutePrompt'
import { getOriginRoomInventory } from '@/lib/roomInventory'
import { AlertTriangle, ArrowRight, Ban, Bell, BellRing, Clock, MessageSquareText, Share2, Star, Settings, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'

import CampusRouteMap, { CampusMapRoom } from '@/components/CampusRouteMap'
import SignupForm from '@/components/auth/SignupForm'
import NavigationBar from '@/components/NavigationBar'

const Grainient = dynamic(() => import('@/components/Grainient'), { ssr: false })
const SplitText = dynamic(() => import('@/components/SplitText'), { ssr: false })

type AuthMode = 'signup' | null

type MyRoomSummary = CampusMapRoom & {
  departure_date: string
  unread_count: number
}

type UnreadRoomCount = {
  room_id: string
  unread_count: number
}

// GET /api/routes 응답 중 FAB 미확인 배지 판정에 필요한 최소 필드만 취한다.
type RouteSubscriptionSummary = {
  from_location: LocationType
  to_location: LocationType
}

type ModerationWarning = {
  id: string
  reason: string
  created_at: string
}

type ModerationStatusPayload = {
  status: 'active' | 'suspended' | 'profile_required'
  suspendedUntil: string | null
  suspensionReason: string | null
  warning: ModerationWarning | null
}

type MyProfilePayload = {
  profileCompleted: boolean
  user: User | null
  payoutAccount?: unknown
  error?: string
}

// Browser-only PWA prompt. Stores the last shown local date so it appears at most
// once per calendar day, re-appears on later days, and never re-fires on
// intra-session navigation back to the map (it was already shown today).
const PWA_PROMPT_LAST_SHOWN_KEY = 'gatita:pwa-prompt-last-shown'
const ROUTE_COACHMARK_STORAGE_KEY = 'gatita:route-coachmark-seen'
// ROUTES_SEEN_STORAGE_KEY(app/routes/page.tsx가 /routes 진입 시 기록하는 마지막 확인 시각)는
// lib/routeSummary.ts에서 import한다 — I-4: 두 파일이 각자 리터럴을 선언하면 오타로
// 계약이 조용히 깨진다.

// Local calendar day as YYYY-MM-DD (en-CA yields ISO-like format in local tz).
const getLocalDateKey = () => new Date().toLocaleDateString('en-CA')
const PWA_INSTALLED_DETECTED_STORAGE_KEY = 'gatita:pwa-installed-detected'
const PUSH_PROMPT_DISMISSED_KEY = 'gatita:push-prompt-dismissed'
const ANALYTICS_PENDING_LOGIN_KEY = 'gatita:analytics-pending-login'
const LANDING_VIEW_LAST_TRACKED_AT_KEY = 'gatita:analytics-landing-view-last-tracked-at'

function rememberPendingLogin(method: string) {
  if (typeof window === 'undefined') return

  window.sessionStorage.setItem(ANALYTICS_PENDING_LOGIN_KEY, JSON.stringify({
    method,
    startedAt: Date.now(),
  }))
}

function consumePendingLogin() {
  if (typeof window === 'undefined') return null

  const raw = window.sessionStorage.getItem(ANALYTICS_PENDING_LOGIN_KEY)
  if (!raw) return null

  window.sessionStorage.removeItem(ANALYTICS_PENDING_LOGIN_KEY)

  try {
    const parsed = JSON.parse(raw) as { method?: string; startedAt?: number }
    if (!parsed.method || !parsed.startedAt) return null
    if (Date.now() - parsed.startedAt > 10 * 60 * 1000) return null
    return parsed.method
  } catch {
    return null
  }
}

function GoogleIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function ServiceSharePrompt({
  isSharing,
  onDismiss,
  onShare,
}: {
  isSharing: boolean
  onDismiss: () => void
  onShare: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-end bg-gray-950/35 px-3 pb-3 pt-20"
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-share-title"
        className="mx-auto w-full max-w-sm rounded-2xl border border-white/80 bg-white p-5 shadow-[0_18px_48px_rgba(17,24,39,0.28)]"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.02em] text-primary-600">같이타 공유하기</p>
            <h2 id="service-share-title" className="mt-1 text-lg font-black leading-tight tracking-tight text-gray-950">
              친구에게 같이타를 알려주세요
            </h2>
          </div>
          <button
            type="button"
            aria-label="공유 안내 닫기"
            onClick={onDismiss}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-950"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">
          아래 버튼을 누르면 카카오톡, 메시지 등 원하는 앱으로 같이타 링크를 보낼 수 있어요.
        </p>

        <button
          type="button"
          onClick={onShare}
          disabled={isSharing}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-black text-white transition hover:bg-primary-700 disabled:cursor-wait disabled:opacity-65"
        >
          <Share2 className="h-4 w-4" />
          {isSharing ? '공유 시트 여는 중...' : '친구에게 공유하기'}
        </button>
      </div>
    </div>
  )
}

// 중복 방 안내 토스트 전용 카드. toast.success/error 등 기본 토스트와 같은 시각 언어(좌측
// 이모지 아이콘, 흰 카드, 중앙 상단에서 아래로 내려오는 모션)를 쓰되 "그 방으로 이동" 액션은
// 유지한다.
//
// react-hot-toast는 toast.custom으로 만든 토스트엔 내부 <ToastBar>를 아예 쓰지 않는다
// (node_modules/react-hot-toast/src/components/toaster.tsx: `t.type === 'custom' ?
// resolveValue(t.message, t) : ...`). ToastBar에만 들어있는 enter/exit keyframe 애니메이션도
// 함께 빠지기 때문에, 커스텀 토스트는 다른 토스트들과 달리 모션 없이 "뚝" 나타나고 사라졌다.
// 여기서는 mount 다음 프레임에 상태를 뒤집어 CSS transition으로 같은 방향(위에서 아래로
// 들어오고, 사라질 때는 위로 빠지며 페이드)의 모션을 재현한다.
//
// 카드의 배경/테두리/모서리 반경/글자 크기/패딩/그림자는 app/layout.tsx의 <Toaster
// toastOptions.style>과 값을 맞춰 다른 토스트와 같은 재질처럼 보이게 했다.
function DuplicateRoomToastCard({
  toast: t,
  message,
  isFull,
  onDismiss,
  onMove,
}: {
  toast: { id: string; visible: boolean }
  message: string
  isFull: boolean
  onDismiss: () => void
  onMove: () => void
}) {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const shown = entered && t.visible

  return (
    <div
      className="pointer-events-auto flex w-full max-w-[400px] items-start gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3"
      style={{
        boxShadow: '0 3px 10px rgba(0,0,0,0.1), 0 3px 3px rgba(0,0,0,0.05)',
        transform: shown ? 'translateY(0) scale(1)' : 'translateY(-16px) scale(0.96)',
        opacity: shown ? 1 : 0,
        transition: 'transform 0.3s cubic-bezier(.21,1.02,.73,1), opacity 0.3s ease',
      }}
    >
      <span className="mt-0.5 text-base leading-none" aria-hidden="true">🚕</span>
      <div className="flex flex-1 flex-col gap-1.5">
        <p className="text-sm leading-snug text-gray-800">{message}</p>
        {!isFull && (
          <button
            type="button"
            onClick={onMove}
            className="self-start text-sm font-semibold text-primary-600 hover:text-primary-700"
          >
            그 방으로 이동
          </button>
        )}
      </div>
      {/* 아이콘만 있는 닫기 버튼이라 두 가지를 맞춰준다.
          - gray-400 은 흰 카드 위 2.54:1 로 UI 컴포넌트 식별 기준(3:1) 미달이다. gray-500
            은 4.83:1 로 통과한다.
          - h-4 아이콘에 패딩이 없으면 탭 영역이 16px 뿐이다. 음수 마진으로 상쇄한 패딩을
            줘서 보이는 위치는 그대로 두고 32px 로 넓힌다(이 앱의 다른 버튼은 40px). */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="닫기"
        className="-m-2 shrink-0 p-2 text-gray-500 hover:text-gray-700"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function getGoogleAccountName(email?: string | null, metadata?: Record<string, unknown> | null) {
  const googleProfile = extractGachonProfileFromMetadata(metadata)

  return googleProfile.name || email?.split('@')[0] || ''
}

function formatKoreanDateTime(value?: string | null) {
  if (!value) return ''

  try {
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function resetDocumentScrollPosition() {
  if (typeof window === 'undefined') return

  window.scrollTo(0, 0)
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}

export default function HomeClient() {
  const [user, setUser] = useState<User | null>(null)
  const [hasAuthenticatedSession, setHasAuthenticatedSession] = useState(false)
  const [pendingProfileEmail, setPendingProfileEmail] = useState('')
  const [pendingProfileName, setPendingProfileName] = useState('')
  const [showProfileRequiredModal, setShowProfileRequiredModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hasResolvedAuthSession, setHasResolvedAuthSession] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>(null)
  const [fromLocation, setFromLocation] = useState<LocationType | ''>('')
  const [mapRooms, setMapRooms] = useState<CampusMapRoom[]>([])
  const [myRooms, setMyRooms] = useState<MyRoomSummary[]>([])
  const [subscribedRoutes, setSubscribedRoutes] = useState<RouteSubscriptionSummary[]>([])
  const [hasUnseenRouteRooms, setHasUnseenRouteRooms] = useState(false)
  const [isLoadingMapRooms, setIsLoadingMapRooms] = useState(false)
  const [isLoadingMyRooms, setIsLoadingMyRooms] = useState(false)
  const [showMyRooms, setShowMyRooms] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [isCreatingMapRoom, setIsCreatingMapRoom] = useState(false)
  const [isStartingGoogle, setIsStartingGoogle] = useState(false)
  const [startingPreviewAccountKey, setStartingPreviewAccountKey] = useState<string | null>(null)
  const [hasEnteredApp, setHasEnteredApp] = useState(false)
  const [showPwaOnboarding, setShowPwaOnboarding] = useState(false)
  const [showPushPrompt, setShowPushPrompt] = useState(false)
  const [showServiceSharePrompt, setShowServiceSharePrompt] = useState(false)
  const [isSharingService, setIsSharingService] = useState(false)
  const [isEnablingPush, setIsEnablingPush] = useState(false)
  const [routeCoachStep, setRouteCoachStep] = useState<'hidden' | 'select' | 'action'>('hidden')
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [moderationStatus, setModerationStatus] = useState<ModerationStatusPayload | null>(null)
  const [moderationModal, setModerationModal] = useState<'warning' | 'suspension' | null>(null)
  const [isAcknowledgingWarning, setIsAcknowledgingWarning] = useState(false)
  // 8-2: 같은 경로로 방을 2회 이상 만들었는데 아직 구독하지 않은 이용자에게, 방 생성
  // 성공 직후 띄우는 구독 유도 시트. roomId는 시트를 닫을 때 이동할 목적지(방금 만든 방)다.
  const [repeatRoutePrompt, setRepeatRoutePrompt] = useState<{ from: LocationType; to: LocationType; roomId: string } | null>(null)
  const [isSubscribingRepeatRoute, setIsSubscribingRepeatRoute] = useState(false)
  const lastAuthErrorAtRef = useRef(0)
  const hasShownProfileRequiredPromptRef = useRef(false)
  const landingViewLastTrackedAtFallbackRef = useRef<number | null>(null)
  const mapHeaderRef = useRef<HTMLElement>(null)
  const pwaInstallSyncInFlightRef = useRef(false)
  const pwaInstallSyncCompletedRef = useRef(false)
  const profileRequiredModalOpenRef = useRef(showProfileRequiredModal)
  const router = useRouter()
  const pathname = usePathname()
  const isMapRoute = pathname === '/map'
  const currentSearch = typeof window !== 'undefined' ? window.location.search : ''
  const explicitRedirectPath = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('redirect')
    : null
  const inviteRedirectPath = pathname.startsWith('/rooms/')
    ? `${pathname}${currentSearch}`
    : explicitRedirectPath?.startsWith('/rooms/') ? explicitRedirectPath : undefined
  const previewTestLoginEnabled = isPreviewTestLoginEnabled()

  profileRequiredModalOpenRef.current = showProfileRequiredModal

  const supabase = useMemo(() => {
    try {
      return createClient()
    } catch (error) {
      console.error('Supabase client creation error:', error)
      return null
    }
  }, [])

  const showAuthError = useCallback((message: string) => {
    const now = Date.now()
    setAuthNotice(message)
    trackEvent('auth_error_shown', {
      reason: message,
    })

    if (now - lastAuthErrorAtRef.current > 1500) {
      toast.error(message)
      lastAuthErrorAtRef.current = now
    }
  }, [])

  const clearServiceShareIntent = useCallback(() => {
    window.history.replaceState({}, '', removeServiceShareIntent(window.location.href))
  }, [])

  const dismissServiceSharePrompt = useCallback(() => {
    trackEvent('service_share_prompt_dismissed', {
      source: 'welcome_email',
    })
    setShowServiceSharePrompt(false)
    clearServiceShareIntent()
  }, [clearServiceShareIntent])

  const handleShareService = useCallback(async () => {
    setIsSharingService(true)

    try {
      const result = await shareService(window.location.href, navigator)
      if (result === 'cancelled') return

      if (result === 'shared') {
        toast.success('공유할 앱을 선택했어요')
        trackEvent('service_share_completed', {
          method: 'native',
          source: 'welcome_email',
        })
      } else {
        toast.success('같이타 링크를 복사했어요')
        trackEvent('service_share_completed', {
          method: 'clipboard',
          source: 'welcome_email',
        })
      }

      setShowServiceSharePrompt(false)
      clearServiceShareIntent()
    } catch (error) {
      console.error('Share service error:', error)
      toast.error('공유 기능을 열지 못했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsSharingService(false)
    }
  }, [clearServiceShareIntent])

  const rejectNonGachonAccount = useCallback(async () => {
    showAuthError(NON_GACHON_ACCOUNT_MESSAGE)
    setUser(null)
    setHasAuthenticatedSession(false)
    setPendingProfileEmail('')
    setPendingProfileName('')
    setShowProfileRequiredModal(false)
    setModerationStatus(null)
    setModerationModal(null)
    setAuthMode(null)
    setHasEnteredApp(false)

    if (supabase) {
      await supabase.auth.signOut()
    }
  }, [showAuthError, supabase])

  const openProfileRequiredModal = useCallback((source: string) => {
    if (!profileRequiredModalOpenRef.current) {
      trackEvent('profile_required_modal_shown', {
        source,
      })
    }

    profileRequiredModalOpenRef.current = true
    setShowProfileRequiredModal(true)
  }, [])

  const dismissProfileRequiredModal = useCallback((dismissType: 'outside' | 'close' | 'start_setup') => {
    if (profileRequiredModalOpenRef.current) {
      trackEvent('profile_required_modal_dismissed', {
        dismiss_type: dismissType,
      })
    }

    profileRequiredModalOpenRef.current = false
    setShowProfileRequiredModal(false)
  }, [])

  const syncPwaInstalledToSupabase = useCallback(async (
    { requireInstalledDisplayMode = true }: { requireInstalledDisplayMode?: boolean } = {},
  ) => {
    if (!hasAuthenticatedSession || !hasEnteredApp) return
    if (requireInstalledDisplayMode && !isInstalled()) return
    if (pwaInstallSyncInFlightRef.current || pwaInstallSyncCompletedRef.current) return

    pwaInstallSyncInFlightRef.current = true

    try {
      const response = await fetch('/api/profile/pwa-install', {
        method: 'POST',
      })

      if (response.ok) {
        pwaInstallSyncCompletedRef.current = true
      } else if (response.status >= 500) {
        console.error('PWA install sync failed:', response.status)
      }
    } catch (error) {
      console.error('PWA install sync error:', error)
    } finally {
      pwaInstallSyncInFlightRef.current = false
    }
  }, [hasAuthenticatedSession, hasEnteredApp])

  const loadModerationStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/moderation/status')
      const result = await response.json().catch(() => null) as ModerationStatusPayload | null

      if (!response.ok || !result) return null

      setModerationStatus(result)

      if (result.status === 'suspended') {
        setModerationModal('suspension')
      } else if (result.warning) {
        setModerationModal('warning')
      }

      return result
    } catch (error) {
      console.error('Load moderation status error:', error)
      return null
    }
  }, [])

  const loadMapRooms = useCallback(async () => {
    if (!supabase) {
      return
    }

    setIsLoadingMapRooms(true)

    try {
      const visibleDates = getMapRoomDateRange(new Date())
      const { data } = await supabase
        .from('chat_rooms')
        .select(`
          id,
          from_location,
          to_location,
          departure_date,
          departure_time,
          max_participants,
          created_at,
          participants:room_participants(id, user_id)
        `)
        .in('departure_date', visibleDates)
        .eq('status', 'active')
        .order('departure_date', { ascending: true })
        .order('departure_time', { ascending: true })

      const sameDayRooms = ((data ?? []) as ChatRoom[])
        .filter((room) => isRoomVisibleOnMap(room.departure_date, room.departure_time))
        .map((room) => ({
          id: room.id,
          from_location: room.from_location,
          to_location: room.to_location,
          departure_date: room.departure_date,
          departure_time: room.departure_time,
          max_participants: room.max_participants,
          // 알림 경로 FAB의 미확인 배지 판정(구독 경로에 새로 열린 방)에 쓴다.
          created_at: room.created_at,
          participants: room.participants?.map((participant) => ({
            id: participant.id,
            user_id: participant.user_id,
          })),
        }))

      setMapRooms(sameDayRooms)
    } catch (error) {
      console.error('Load map rooms error:', error)
    } finally {
      setIsLoadingMapRooms(false)
    }
  }, [supabase])

  // 알림 경로 FAB 배지용 구독 목록. favorites의 notify_* 컬럼이 아직 프로덕션에
  // 반영되지 않아 이 조회가 실패할 수 있다 — 실패해도 지도가 깨지면 안 되므로
  // 조용히 빈 목록으로 남기고(= 배지 없음) 지도 기능에는 영향을 주지 않는다.
  const loadRouteSubscriptions = useCallback(async () => {
    try {
      const res = await fetch('/api/routes')
      if (!res.ok) {
        setSubscribedRoutes([])
        return
      }

      const json = (await res.json().catch(() => null)) as { routes?: RouteSubscriptionSummary[] } | null
      setSubscribedRoutes(json?.routes ?? [])
    } catch (error) {
      console.error('Load route subscriptions error:', error)
      setSubscribedRoutes([])
    }
  }, [])

  const loadUnreadCount = useCallback(async () => {
    if (!supabase) return

    try {
      const { data, error } = await supabase.rpc('get_my_unread_count')
      if (error) throw error
      setUnreadCount(typeof data === 'number' ? data : 0)
    } catch (error) {
      console.error('Load unread count error:', error)
    }
  }, [supabase])

  const loadMyRooms = useCallback(async () => {
    if (!supabase || !user) {
      setMyRooms([])
      return
    }

    setIsLoadingMyRooms(true)

    try {
      const { data: memberships, error: membershipsError } = await supabase
        .from('room_participants')
        .select('room_id')
        .eq('user_id', user.id)

      if (membershipsError) throw membershipsError

      const roomIds = Array.from(new Set((memberships ?? []).map((membership) => membership.room_id)))

      if (roomIds.length === 0) {
        setMyRooms([])
        return
      }

      const { data: rooms, error: roomsError } = await supabase
        .from('chat_rooms')
        .select(`
          id,
          from_location,
          to_location,
          departure_date,
          departure_time,
          max_participants,
          participants:room_participants(id, user_id)
        `)
        .in('id', roomIds)
        .eq('status', 'active')
        .order('departure_date', { ascending: false })
        .order('departure_time', { ascending: false })

      if (roomsError) throw roomsError

      const { data: unreadRoomCounts, error: unreadRoomCountsError } = await supabase.rpc('get_my_unread_room_counts')

      if (unreadRoomCountsError) throw unreadRoomCountsError

      const unreadCountByRoomId = new Map(
        ((unreadRoomCounts ?? []) as UnreadRoomCount[]).map((row) => [row.room_id, row.unread_count])
      )

      setMyRooms(((rooms ?? []) as ChatRoom[]).map((room) => ({
        id: room.id,
        from_location: room.from_location,
        to_location: room.to_location,
        departure_date: room.departure_date,
        departure_time: room.departure_time,
        max_participants: room.max_participants,
        participants: room.participants?.map((participant) => ({
          id: participant.id,
          user_id: participant.user_id,
        })),
        unread_count: unreadCountByRoomId.get(room.id) ?? 0,
      })))
    } catch (error) {
      console.error('Load my rooms error:', error)
      toast.error('나의 방을 불러오지 못했습니다')
    } finally {
      setIsLoadingMyRooms(false)
    }
  }, [supabase, user])

  const checkAuth = useCallback(async (enterApp = false) => {
    setHasResolvedAuthSession(false)

    if (!supabase) {
      setLoading(false)
      return
    }

    try {
      const enterMap = (profileCompleted: boolean) => {
        if (!enterApp) return

        resetDocumentScrollPosition()
        setHasEnteredApp(true)
        trackEvent('map_opened', {
          source: 'auth_redirect',
          profile_completed: profileCompleted,
        })
        if (window.location.pathname !== '/map') {
          router.replace('/map')
        }
      }
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('getSession timeout')), 15000)
      })
      const { data: { session }, error: sessionError } = await Promise.race([
        supabase.auth.getSession(),
        timeout
      ])

      if (sessionError) {
        throw sessionError
      }

      setHasResolvedAuthSession(true)

      if (session?.user) {
        const email = session.user.email
        if (!isGachonEmail(email)) {
          await rejectNonGachonAccount()
          return
        }
        const pendingLoginMethod = consumePendingLogin()

        setHasAuthenticatedSession(true)
        setPendingProfileEmail(email ?? '')

        const profileResponse = await fetch('/api/profile/me')
        const profileResult = await profileResponse.json().catch(() => null) as MyProfilePayload | null

        if (!profileResponse.ok) {
          throw new Error(profileResult?.error ?? '프로필을 확인하지 못했습니다')
        }

        const userData = profileResult?.user

        if (profileResult?.profileCompleted && userData) {
          setAuthNotice(null)
          setPendingProfileName('')
          setUser(userData)
          await loadModerationStatus()
          const shouldSuppressAnalytics = shouldSuppressAnalyticsForUser({
            userId: userData.id,
            email: userData.email,
            isAdmin: userData.is_admin,
          })

          if (shouldSuppressAnalytics) {
            suppressAnalyticsForCurrentDevice()
          } else {
            identifyAnalyticsUser(userData.id, {
              profile_completed: true,
              is_admin: userData.is_admin,
              account_status: userData.status,
              department: userData.department,
            })
            trackEvent('auth_session_loaded', {
              profile_completed: true,
            })
            if (pendingLoginMethod) {
              trackEvent('login_succeeded', {
                method: pendingLoginMethod,
                profile_completed: true,
              })
            }
          }
          enterMap(true)
        } else {
          setPendingProfileName(getGoogleAccountName(email, session.user.user_metadata))
          setUser(null)
          setModerationStatus(null)
          setModerationModal(null)
          setAuthMode(null)
          identifyAnalyticsUser(session.user.id, {
            profile_completed: false,
          })
          trackEvent('auth_session_loaded', {
            profile_completed: false,
          })
          if (pendingLoginMethod) {
            trackEvent('login_succeeded', {
              method: pendingLoginMethod,
              profile_completed: false,
            })
          }
          enterMap(false)
        }
      } else if (window.location.pathname === '/map') {
        setHasAuthenticatedSession(false)
        setPendingProfileEmail('')
        setPendingProfileName('')
        setUser(null)
        setModerationStatus(null)
        setModerationModal(null)
        identifyAnalyticsUser(null)
        router.replace('/')
      } else {
        setHasAuthenticatedSession(false)
        setPendingProfileEmail('')
        setPendingProfileName('')
        setUser(null)
        setModerationStatus(null)
        setModerationModal(null)
        identifyAnalyticsUser(null)
      }
    } catch (error) {
      console.error('Auth check error:', error)
    } finally {
      setLoading(false)
    }
  }, [loadModerationStatus, rejectNonGachonAccount, router, supabase])

  useEffect(() => {
    if (!hasServiceShareIntent(window.location.search)) return

    setShowServiceSharePrompt(true)
    trackEvent('service_share_prompt_viewed', {
      source: new URLSearchParams(window.location.search).get('utm_source') || 'direct',
    })
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    const params = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const authError = params.get('auth_error') || params.get('error_description') || hashParams.get('error_description')
    const shouldEnterApp = params.get('auth') === 'complete' || window.location.pathname === '/map'

    if (authError) {
      const message = authError.replace(/\+/g, ' ')
      setAuthNotice(message)
      toast.error(message)
    }

    if (authError || shouldEnterApp) {
      window.history.replaceState({}, '', window.location.pathname)
    }

    checkAuth(shouldEnterApp)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setHasAuthenticatedSession(false)
        setPendingProfileEmail('')
        setPendingProfileName('')
        setShowProfileRequiredModal(false)
        setModerationStatus(null)
        setModerationModal(null)
        setAuthMode(null)
        setHasEnteredApp(false)
        pwaInstallSyncCompletedRef.current = false
      }
    })

    return () => subscription.unsubscribe()
  }, [checkAuth, supabase])

  useEffect(() => {
    router.prefetch('/map')
  }, [router])

  useEffect(() => {
    if (!isInstalled()) return

    void syncPwaInstalledToSupabase()

    if (!window.localStorage.getItem(PWA_INSTALLED_DETECTED_STORAGE_KEY)) {
      window.localStorage.setItem(PWA_INSTALLED_DETECTED_STORAGE_KEY, 'true')
      trackEvent('pwa_installed_detected', {
        detection_source: 'standalone_open',
      })
    }

  }, [syncPwaInstalledToSupabase])

  useEffect(() => {
    const handleBeforeInstallPrompt = () => {
      trackEvent('pwa_install_prompt_available', {
        source: 'beforeinstallprompt',
      })
    }

    const handleAppInstalled = () => {
      void syncPwaInstalledToSupabase({ requireInstalledDisplayMode: false })
      window.localStorage.setItem(PWA_INSTALLED_DETECTED_STORAGE_KEY, 'true')
      trackEvent('pwa_installed_detected', {
        detection_source: 'appinstalled',
      })
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [syncPwaInstalledToSupabase])

  useEffect(() => {
    if (!supabase || !hasAuthenticatedSession || !hasEnteredApp || authMode === 'signup') return

    loadMapRooms()
    loadUnreadCount()
    loadRouteSubscriptions()

    // 30초 전체 폴링 대신 실시간 구독 + 디바운스 재조회 (chat_rooms는 마이그레이션 적용 후 발화)
    let debounceId: ReturnType<typeof setTimeout> | null = null
    const scheduleReload = () => {
      if (debounceId) clearTimeout(debounceId)
      debounceId = setTimeout(() => {
        debounceId = null
        loadMapRooms()
      }, 500)
    }

    // 새 메시지가 오면 안 읽은 수 배지를 갱신 (내 방만 RPC에서 필터됨)
    let unreadDebounceId: ReturnType<typeof setTimeout> | null = null
    const scheduleUnreadReload = () => {
      if (unreadDebounceId) clearTimeout(unreadDebounceId)
      unreadDebounceId = setTimeout(() => {
        unreadDebounceId = null
        loadUnreadCount()
        if (showMyRooms) loadMyRooms()
      }, 600)
    }

    const channel = supabase
      .channel('map-rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_rooms' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_participants' }, scheduleReload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, scheduleUnreadReload)
      .subscribe()

    // 실시간 누락 대비 저빈도 안전망 + 탭 복귀 시 갱신
    const refreshAll = () => {
      loadMapRooms()
      loadUnreadCount()
      loadRouteSubscriptions()
      if (showMyRooms) loadMyRooms()
    }
    const safetyId = window.setInterval(refreshAll, 120000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshAll()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (debounceId) clearTimeout(debounceId)
      if (unreadDebounceId) clearTimeout(unreadDebounceId)
      window.clearInterval(safetyId)
      document.removeEventListener('visibilitychange', handleVisibility)
      supabase.removeChannel(channel)
    }
  }, [authMode, hasAuthenticatedSession, hasEnteredApp, loadMapRooms, loadMyRooms, loadRouteSubscriptions, loadUnreadCount, showMyRooms, supabase])

  // 알림 경로 FAB 미확인 배지: 구독 경로 중 지금 입장 가능한 방이 있고, 그 방이
  // /routes 화면을 마지막으로 연 시각(Task 10이 남긴 localStorage 값) 이후에 생겼을 때만 켠다.
  // 푸시가 실제로 닿는 이용자가 설치자의 30%뿐이라, 이 배지가 대부분의 이용자에게
  // "내 경로에 방이 생겼다"를 알리는 유일한 신호다.
  useEffect(() => {
    if (subscribedRoutes.length === 0) {
      setHasUnseenRouteRooms(false)
      return
    }

    const seenAtRaw = window.localStorage.getItem(ROUTES_SEEN_STORAGE_KEY)
    const seenAtMs = seenAtRaw ? new Date(seenAtRaw).getTime() : 0
    const routeKeys = new Set(
      subscribedRoutes.map((route) => `${route.from_location}>${route.to_location}`)
    )

    const hasUnseen = mapRooms.some((room) => {
      if (!routeKeys.has(`${room.from_location}>${room.to_location}`)) return false
      if (!room.created_at) return false
      if (!isRoomJoinable(room.departure_date, room.departure_time)) return false
      return new Date(room.created_at).getTime() > seenAtMs
    })

    setHasUnseenRouteRooms(hasUnseen)
  }, [mapRooms, subscribedRoutes])

  const onlineDisplayCount = usePresenceDisplayCount(
    supabase,
    user && hasEnteredApp ? 'presence:gachon-map' : null,
    user
  )

  const isResolvingMapSession = loading && isMapRoute
  const requiresProfile = !loading && hasAuthenticatedSession && !user
  const profileDisplayName = user?.nickname || pendingProfileName || pendingProfileEmail.split('@')[0] || '가천대'
  const mapGreetingText = isResolvingMapSession ? '계정 확인 중...' : `${profileDisplayName}님, 안녕하세요!`
  const showLanding = !loading && authMode !== 'signup' && (!hasAuthenticatedSession || !hasEnteredApp)
  const isCurrentlySuspended = moderationStatus?.status === 'suspended' || user?.status === 'suspended'
  const activeSuspendedUntil = moderationStatus?.suspendedUntil ?? user?.suspended_until ?? null
  const activeSuspensionReason = moderationStatus?.suspensionReason ?? user?.suspension_reason ?? null

  useEffect(() => {
    const now = Date.now()
    let lastTrackedAt = landingViewLastTrackedAtFallbackRef.current

    try {
      const storedAt = Number(window.sessionStorage.getItem(LANDING_VIEW_LAST_TRACKED_AT_KEY))
      if (Number.isFinite(storedAt) && storedAt > 0 && (lastTrackedAt === null || storedAt > lastTrackedAt)) {
        lastTrackedAt = storedAt
      }
    } catch {
      // The in-memory fallback still prevents repeats during this page lifecycle.
    }

    if (!shouldTrackAnonymousLanding({
      loading,
      hasResolvedAuthSession,
      hasAuthenticatedSession,
      hasEnteredApp,
      authMode,
      lastTrackedAt,
      now,
    })) return

    landingViewLastTrackedAtFallbackRef.current = now
    try {
      window.sessionStorage.setItem(LANDING_VIEW_LAST_TRACKED_AT_KEY, String(now))
    } catch {
      // Analytics must not block the landing page when storage is unavailable.
    }

    trackEvent('landing_viewed', { auth_state: 'anonymous' })
  }, [authMode, hasAuthenticatedSession, hasEnteredApp, hasResolvedAuthSession, loading])

  useEffect(() => {
    if (!requiresProfile) {
      hasShownProfileRequiredPromptRef.current = false
      return
    }

    if (!hasEnteredApp || authMode === 'signup') return
    if (hasShownProfileRequiredPromptRef.current) return

    hasShownProfileRequiredPromptRef.current = true
    const timerId = window.setTimeout(() => {
      openProfileRequiredModal('map_auto_prompt')
    }, 300)

    return () => window.clearTimeout(timerId)
  }, [authMode, hasEnteredApp, openProfileRequiredModal, requiresProfile])

  // iOS Safari keeps scroll position across auth state changes and reports
  // dynamic viewport units differently as the bottom bar expands/collapses.
  // Keep the landing fixed to the visual viewport and reset stale scroll.
  useEffect(() => {
    if (!showLanding) return

    const root = document.documentElement
    const body = document.body
    const scrollOffset = 1
    const setLandingViewport = () => {
      const visualHeight = window.visualViewport?.height ?? window.innerHeight
      const backgroundHeight = Math.max(
        visualHeight,
        window.innerHeight,
        window.screen?.height ?? 0
      )

      root.style.setProperty('--landing-viewport-height', `${Math.ceil(visualHeight)}px`)
      root.style.setProperty('--landing-background-height', `${Math.ceil(backgroundHeight + scrollOffset)}px`)
    }
    const keepSafariComposited = () => {
      if (Math.abs(window.scrollY - scrollOffset) > 0.5) {
        window.scrollTo(0, scrollOffset)
      }
    }
    const blockUserScroll = (event: TouchEvent | WheelEvent) => {
      event.preventDefault()
    }

    setLandingViewport()
    window.scrollTo(0, scrollOffset)
    root.classList.add('landing-lock')
    body.classList.add('landing-lock')

    window.addEventListener('resize', setLandingViewport)
    window.addEventListener('orientationchange', setLandingViewport)
    window.visualViewport?.addEventListener('resize', setLandingViewport)
    window.visualViewport?.addEventListener('scroll', setLandingViewport)
    window.addEventListener('scroll', keepSafariComposited, { passive: true })
    document.addEventListener('touchmove', blockUserScroll, { passive: false })
    document.addEventListener('wheel', blockUserScroll, { passive: false })

    const frameId = window.requestAnimationFrame(keepSafariComposited)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', setLandingViewport)
      window.removeEventListener('orientationchange', setLandingViewport)
      window.visualViewport?.removeEventListener('resize', setLandingViewport)
      window.visualViewport?.removeEventListener('scroll', setLandingViewport)
      window.removeEventListener('scroll', keepSafariComposited)
      document.removeEventListener('touchmove', blockUserScroll)
      document.removeEventListener('wheel', blockUserScroll)
      root.classList.remove('landing-lock')
      body.classList.remove('landing-lock')
      window.scrollTo(0, 0)
    }
  }, [showLanding])

  useEffect(() => {
    if (!hasAuthenticatedSession || !hasEnteredApp) return

    const root = document.documentElement
    const body = document.body
    const previousAppViewportHeight = root.style.getPropertyValue('--app-viewport-height')
    const previousMapViewportHeight = root.style.getPropertyValue('--map-viewport-height')
    const previousMapHeaderBottom = root.style.getPropertyValue('--map-header-bottom')
    const previousRootOverflow = root.style.overflow
    const previousBodyOverflow = body.style.overflow
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior
    const standaloneDisplayQuery = window.matchMedia('(display-mode: standalone)')

    const setAppViewport = () => {
      const visualHeight = window.visualViewport?.height ?? window.innerHeight
      const mapHeight = Math.max(visualHeight, window.innerHeight, document.documentElement.clientHeight)
      const headerBottom = mapHeaderRef.current?.getBoundingClientRect().bottom

      root.style.setProperty('--app-viewport-height', `${Math.ceil(visualHeight)}px`)
      root.style.setProperty('--map-viewport-height', `${Math.ceil(mapHeight)}px`)
      if (typeof headerBottom === 'number' && headerBottom > 0) {
        root.style.setProperty('--map-header-bottom', `${Math.ceil(headerBottom)}px`)
      }
    }
    const applyMapDisplayMode = () => {
      const isStandaloneMap = isInstalled()

      root.classList.toggle('gatita-standalone-map', isStandaloneMap)
      root.classList.toggle('gatita-browser-map', !isStandaloneMap)
    }

    const resetMapScroll = () => {
      resetDocumentScrollPosition()
    }
    const syncAppViewport = () => {
      setAppViewport()
      resetMapScroll()
    }

    setAppViewport()
    applyMapDisplayMode()
    resetMapScroll()
    root.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    const firstFrameId = window.requestAnimationFrame(() => {
      setAppViewport()
      resetMapScroll()
    })
    const secondFrameId = window.requestAnimationFrame(resetMapScroll)
    const scrollResetTimerId = window.setTimeout(resetMapScroll, 250)

    const headerResizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncAppViewport)
      : null
    if (mapHeaderRef.current) headerResizeObserver?.observe(mapHeaderRef.current)

    window.addEventListener('resize', syncAppViewport)
    window.addEventListener('orientationchange', syncAppViewport)
    window.visualViewport?.addEventListener('resize', syncAppViewport)
    window.visualViewport?.addEventListener('scroll', syncAppViewport)
    if (typeof standaloneDisplayQuery.addEventListener === 'function') {
      standaloneDisplayQuery.addEventListener('change', applyMapDisplayMode)
    } else {
      standaloneDisplayQuery.addListener(applyMapDisplayMode)
    }

    return () => {
      if (previousAppViewportHeight) {
        root.style.setProperty('--app-viewport-height', previousAppViewportHeight)
      } else {
        root.style.removeProperty('--app-viewport-height')
      }
      if (previousMapViewportHeight) {
        root.style.setProperty('--map-viewport-height', previousMapViewportHeight)
      } else {
        root.style.removeProperty('--map-viewport-height')
      }
      if (previousMapHeaderBottom) {
        root.style.setProperty('--map-header-bottom', previousMapHeaderBottom)
      } else {
        root.style.removeProperty('--map-header-bottom')
      }
      root.style.overflow = previousRootOverflow
      body.style.overflow = previousBodyOverflow
      body.style.overscrollBehavior = previousBodyOverscrollBehavior
      root.classList.remove('gatita-standalone-map', 'gatita-browser-map')
      headerResizeObserver?.disconnect()
      window.cancelAnimationFrame(firstFrameId)
      window.cancelAnimationFrame(secondFrameId)
      window.clearTimeout(scrollResetTimerId)
      window.removeEventListener('resize', syncAppViewport)
      window.removeEventListener('orientationchange', syncAppViewport)
      window.visualViewport?.removeEventListener('resize', syncAppViewport)
      window.visualViewport?.removeEventListener('scroll', syncAppViewport)
      if (typeof standaloneDisplayQuery.removeEventListener === 'function') {
        standaloneDisplayQuery.removeEventListener('change', applyMapDisplayMode)
      } else {
        standaloneDisplayQuery.removeListener(applyMapDisplayMode)
      }
    }
  }, [hasAuthenticatedSession, hasEnteredApp])

  useEffect(() => {
    if (!hasAuthenticatedSession || !hasEnteredApp) return
    if (requiresProfile) return
    if (isInstalled()) return // never prompt inside the installed PWA
    // Show once per calendar day in the browser. Already shown today (incl. after
    // returning to /map from settings/chat) → skip; a new day → show again.
    const today = getLocalDateKey()
    if (window.localStorage.getItem(PWA_PROMPT_LAST_SHOWN_KEY) === today) return

    const timerId = window.setTimeout(() => {
      window.localStorage.setItem(PWA_PROMPT_LAST_SHOWN_KEY, today)
      setShowPwaOnboarding(true)
      trackEvent('pwa_install_instruction_shown', {
        source: 'map_onboarding',
      })
    }, 600)

    return () => window.clearTimeout(timerId)
  }, [hasAuthenticatedSession, hasEnteredApp, requiresProfile])

  // 설치된 PWA에서 알림 권한을 아직 정하지 않은 유저에게 "알림 켜기" 안내를 띄운다.
  useEffect(() => {
    if (!hasAuthenticatedSession || !hasEnteredApp) return
    if (requiresProfile) return
    if (showPwaOnboarding) return
    if (!isInstalled() || !isPushSupported()) return
    if (getNotificationPermission() !== 'default') return
    if (window.localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY)) return

    let cancelled = false
    const timerId = window.setTimeout(async () => {
      const alreadySubscribed = await isSubscribedToPush()
      if (cancelled || alreadySubscribed) return
      setShowPushPrompt(true)
      trackEvent('push_prompt_shown', { source: 'installed_home' })
    }, 800)

    return () => {
      cancelled = true
      window.clearTimeout(timerId)
    }
  }, [hasAuthenticatedSession, hasEnteredApp, requiresProfile, showPwaOnboarding])

  const endRouteCoachmark = useCallback((action: 'select-close' | 'action-close' = 'action-close') => {
    window.localStorage.setItem(ROUTE_COACHMARK_STORAGE_KEY, 'true')
    setRouteCoachStep((current) => {
      if (current !== 'hidden') {
        trackEvent('route_coachmark_dismissed', { action, step: current })
      }
      return 'hidden'
    })
  }, [])

  // Step 1 → Step 2: once a departure is chosen, swap the floating "select" hint for the
  // in-sheet "join or create" nudge, and persist so the onboarding never reappears later.
  const advanceRouteCoachmark = useCallback(() => {
    window.localStorage.setItem(ROUTE_COACHMARK_STORAGE_KEY, 'true')
    setRouteCoachStep((current) => (current === 'select' ? 'action' : current))
  }, [])

  useEffect(() => {
    if (!hasAuthenticatedSession || !hasEnteredApp) return
    if (requiresProfile) return
    if (showPwaOnboarding || fromLocation) return
    if (window.localStorage.getItem(ROUTE_COACHMARK_STORAGE_KEY)) return
    // Wait until the PWA install step is resolved this session (installed, or today's
    // prompt already shown — and thus dismissed, since this runs when it's not open)
    // so the two onboarding prompts never overlap.
    if (!isInstalled() && window.localStorage.getItem(PWA_PROMPT_LAST_SHOWN_KEY) !== getLocalDateKey()) return

    const timerId = window.setTimeout(() => {
      setRouteCoachStep((current) => (current === 'hidden' ? 'select' : current))
      trackEvent('route_coachmark_shown', {
        source: 'map_onboarding',
      })
    }, 450)

    return () => window.clearTimeout(timerId)
  }, [hasAuthenticatedSession, hasEnteredApp, requiresProfile, showPwaOnboarding, fromLocation])

  const validateRouteSelection = (from: LocationType | '', to: LocationType | '') => {
    if (!from || !to) {
      toast.error('출발지와 도착지를 모두 선택해주세요')
      return false
    }

    if (from === to) {
      toast.error('출발지와 도착지가 같을 수 없습니다')
      trackEvent('route_validation_failed', {
        reason: 'same_location',
        from_location: from,
        to_location: to,
      })
      return false
    }

    if (isRestrictedRoutePair(from, to)) {
      toast.error(ROUTE_TOO_CLOSE_MESSAGE)
      trackEvent('route_validation_failed', {
        reason: 'too_close',
        from_location: from,
        to_location: to,
      })
      return false
    }

    return true
  }

  const handleFromLocationChange = (location: LocationType | '') => {
    if (isResolvingMapSession) return

    if (requiresProfile) {
      openProfileRequiredModal('fixed_point_select')
      return
    }

    if (isCurrentlySuspended) {
      setModerationModal('suspension')
      return
    }

    setFromLocation(location)
    if (location) {
      const inventory = getOriginRoomInventory(mapRooms, location)

      void fetch('/api/analytics/location-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_location: location }),
        keepalive: true,
      }).catch(() => {
        // Metrics 기록 실패가 지도/시트 사용성을 방해하지 않도록 무시한다.
      })

      advanceRouteCoachmark()
      trackEvent('fixed_point_selected', {
        from_location: location,
        visible_room_count: inventory.visibleRoomCount,
        joinable_room_count: inventory.joinableRoomCount,
        has_joinable_room: inventory.hasJoinableRoom,
        inventory_state: isLoadingMapRooms ? 'loading' : 'ready',
      })
    }
  }

  const handleCreateMapRoom = async ({
    fromLocation: roomFromLocation,
    toLocation: roomToLocation,
    departureTime,
    creationSource,
  }: {
    fromLocation: LocationType
    toLocation: LocationType
    departureTime: string
    creationSource?: 'standard' | 'dormitory_request'
  }): Promise<boolean> => {
    const isDormitoryRequest = creationSource === 'dormitory_request'
    const trackDormitoryRequestFailure = (failureStage: string, reasonCode: string) => {
      if (!isDormitoryRequest) return
      trackEvent('dormitory_request_failed', {
        from_location: roomFromLocation,
        failure_stage: failureStage,
        reason_code: reasonCode,
      })
    }

    if (isResolvingMapSession) return false

    if (!user || !supabase) {
      trackDormitoryRequestFailure('authentication', 'profile_or_session_missing')
      if (requiresProfile) {
        openProfileRequiredModal('room_create')
      } else {
        toast.error('로그인이 필요합니다')
      }
      return false
    }

    if (!validateRouteSelection(roomFromLocation, roomToLocation)) {
      trackDormitoryRequestFailure('validation', 'invalid_route')
      return false
    }

    if (isCurrentlySuspended) {
      trackDormitoryRequestFailure('authorization', 'account_suspended')
      setModerationModal('suspension')
      return false
    }

    if (!departureTime) {
      trackDormitoryRequestFailure('validation', 'departure_time_missing')
      toast.error('출발예정시간을 선택해주세요')
      return false
    }

    trackEvent('room_create_started', {
      from_location: roomFromLocation,
      to_location: roomToLocation,
      departure_time: departureTime,
      source: 'map_bottom_sheet',
      creation_source: creationSource ?? 'standard',
    })
    const departureDate = getDepartureDateForTime(new Date(), departureTime)
    if (!departureDate) {
      toast.error('출발 가능 시간이 지났어요. 시간을 다시 선택해주세요')
      trackEvent('room_create_failed', {
        from_location: roomFromLocation,
        to_location: roomToLocation,
        departure_time: departureTime,
        reason: 'departure_time_out_of_window',
        creation_source: creationSource ?? 'standard',
      })
      trackDormitoryRequestFailure('validation', 'departure_time_out_of_window')
      return false
    }

    // 클라이언트에 이미 로드된 mapRooms로 먼저 중복을 판정한다. 같은 경로·같은 출발일시에
    // 방이 둘로 갈리면 매칭 확률이 그대로 절반이 되므로(46일 실측: 참여자 2명 이상 방은
    // 37개 중 2개뿐), insert를 시도하기 전에 걸러 이용자에게 왜 안 되는지 바로 보여준다.
    // 다만 이 검사는 UX용일 뿐 경쟁 조건 방어선이 아니다 — 최종 방어는 DB 유니크
    // 인덱스(chat_rooms_active_route_departure_unique_idx)이고, 그 위반(23505)은 아래
    // insert 에러 처리에서 별도로 잡는다.
    const duplicate = findDuplicateActiveRoom(mapRooms, {
      fromLocation: roomFromLocation,
      toLocation: roomToLocation,
      departureDate,
      departureTime,
    })

    if (duplicate) {
      trackEvent('room_create_blocked', {
        from_location: roomFromLocation,
        to_location: roomToLocation,
        departure_time: departureTime,
        reason: 'duplicate_active_room',
        creation_source: creationSource ?? 'standard',
      })
      trackDormitoryRequestFailure('duplicate_check', 'duplicate_active_room')
      promptDuplicateRoom(duplicate)
      return false
    }

    setIsCreatingMapRoom(true)
    let failureStage = 'room_transaction'

    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_location: roomFromLocation,
          to_location: roomToLocation,
          departure_date: departureDate,
          departure_time: departureTime,
          creation_source: creationSource ?? 'standard',
        }),
      })
      const result = await response.json().catch(() => null) as
        | { room?: ChatRoom; error?: string; code?: string }
        | null

      if (response.status === 401) {
        trackEvent('room_create_failed', {
          from_location: roomFromLocation,
          to_location: roomToLocation,
          departure_time: departureTime,
          creation_source: creationSource ?? 'standard',
          error_code: 'session_expired',
        })
        trackDormitoryRequestFailure('authentication', 'session_expired')
        toast.error('로그인이 만료되었습니다. 다시 로그인해주세요', { id: 'map-session-expired' })
        router.replace('/')
        return false
      }

      if (!response.ok || !result?.room) {
        if (result?.code === 'duplicate_active_room') {
          // 위 mapRooms 체크를 지나친 경쟁 조건(두 사람이 거의 동시에 같은 방을 만듦).
          // 방금 DB에 먼저 들어간 그 방을 다시 조회해 같은 안내로 유도한다.
          trackEvent('room_create_failed', {
            from_location: roomFromLocation,
            to_location: roomToLocation,
            departure_time: departureTime,
            reason: 'duplicate_active_room',
            creation_source: creationSource ?? 'standard',
          })
          trackDormitoryRequestFailure('room_insert', 'duplicate_active_room')

          const { data: existingRoom } = await supabase
            .from('chat_rooms')
            .select(`
              id,
              from_location,
              to_location,
              departure_date,
              departure_time,
              max_participants,
              participants:room_participants(id, user_id)
            `)
            .eq('from_location', roomFromLocation)
            .eq('to_location', roomToLocation)
            .eq('departure_date', departureDate)
            .eq('departure_time', departureTime)
            .eq('status', 'active')
            .maybeSingle()

          if (existingRoom) {
            promptDuplicateRoom(existingRoom as CampusMapRoom)
          } else {
            toast.error(DUPLICATE_ROOM_MESSAGE)
          }
          return false
        }

        const requestError = new Error(result?.error ?? '채팅방을 만들지 못했습니다') as Error & { code?: string }
        requestError.code = result?.code
        throw requestError
      }

      const room = result.room

      // 방과 방장 참여 행은 create_room_with_participant RPC에서 하나의
      // 트랜잭션으로 생성된다. 참여 이력 트리거와 신규 방 푸시도 그
      // 트랜잭션이 커밋된 방에 대해서만 남게 된다.
      toast.success('채팅방이 생성되었습니다!')
      trackEvent('room_created', {
        room_id: room.id,
        from_location: roomFromLocation,
        to_location: roomToLocation,
        departure_date: departureDate,
        departure_time: departureTime,
        source: 'map_bottom_sheet',
        creation_source: creationSource ?? 'standard',
      })

      if (isDormitoryRequest) {
        const departureLeadMinutes = Math.max(
          0,
          Math.round((getRoomDepartureDateTime(departureDate, departureTime).getTime() - Date.now()) / 60_000),
        )
        trackEvent('dormitory_request_submitted', {
          from_location: roomFromLocation,
          to_location: roomToLocation,
          departure_lead_minutes: departureLeadMinutes,
        })
      }

      // 8-2: 같은 경로로 2번째(+) 방을 만든 순간이 구독 유도 최적 시점이라는 근거(46일
      // 실측: 방을 2개 이상 만든 9명 중 7명이 단일 경로 반복). 이 조회는 부가 기능이라
      // 실패해도 방 생성 흐름(입장 이동)을 막지 않는다 — 전체를 try/catch로 감싸고
      // 실패 시 조용히 기존 흐름(즉시 이동)으로 넘어간다.
      try {
        if (isDormitoryRequest) {
          router.push(`/rooms/${room.id}`)
          return true
        }

        const { count: routeRoomCount, error: countError } = await supabase
          .from('chat_rooms')
          .select('id', { count: 'exact', head: true })
          .eq('created_by', user.id)
          .eq('from_location', roomFromLocation)
          .eq('to_location', roomToLocation)

        if (countError) throw countError

        const dismissKey = buildRepeatRoutePromptDismissKey(roomFromLocation, roomToLocation)
        const wasPreviouslyDismissed = window.localStorage.getItem(dismissKey) === 'true'

        // 어차피 2회 미만이거나 이미 거절했으면 뜨지 않을 프롬프트이므로, 그 경우엔
        // /api/routes 조회 자체를 건너뛴다.
        let isAlreadySubscribed = false
        if (!wasPreviouslyDismissed && (routeRoomCount ?? 0) >= 2) {
          const routesRes = await fetch('/api/routes', { cache: 'no-store' })
          if (routesRes.ok) {
            const routesJson = (await routesRes.json().catch(() => null)) as
              | { routes?: { from_location: string; to_location: string }[] }
              | null
            isAlreadySubscribed = (routesJson?.routes ?? []).some(
              (route) => route.from_location === roomFromLocation && route.to_location === roomToLocation,
            )
          }
        }

        if (
          shouldPromptRepeatRouteSubscription({
            createdRoomCount: routeRoomCount ?? 0,
            isAlreadySubscribed,
            wasPreviouslyDismissed,
          })
        ) {
          // I-1: route_subscribed(전환, 분자)만 있고 이 프롬프트의 노출(분모)이 없으면
          // 전환율을 잴 수 없다. 설계 문서 "신규 분석 이벤트" 절의 canonical 정의를 따른다.
          trackEvent('repeat_route_prompt_shown', {
            from_location: roomFromLocation,
            to_location: roomToLocation,
            created_room_count: routeRoomCount ?? 0,
          })
          setRepeatRoutePrompt({ from: roomFromLocation, to: roomToLocation, roomId: room.id })
          return true
        }
      } catch (error) {
        console.error('Repeat route prompt check error:', error)
      }

      router.push(`/rooms/${room.id}`)
      return true
    } catch (error) {
      console.error('Create map room error:', error)
      trackEvent('room_create_failed', {
        from_location: roomFromLocation,
        to_location: roomToLocation,
        departure_time: departureTime,
        creation_source: creationSource ?? 'standard',
      })
      trackDormitoryRequestFailure(
        failureStage,
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : 'unknown_error',
      )
      toast.error(error instanceof Error ? error.message : '채팅방 생성 중 오류가 발생했습니다')
      return false
    } finally {
      setIsCreatingMapRoom(false)
    }
  }

  // 프롬프트를 닫고 방금 만든 방으로 이동만 하는 공용 로직. persist 여부는 호출부가 결정한다.
  const closeRepeatRoutePrompt = () => {
    const roomId = repeatRoutePrompt?.roomId
    setRepeatRoutePrompt(null)
    if (roomId) router.push(`/rooms/${roomId}`)
  }

  // 배경(backdrop) 탭 전용: 실수로 배경을 한 번 눌렀다고 그 경로가 영구 봉인되면 안 되므로
  // localStorage에는 아무것도 남기지 않는다. "다음에요"/X처럼 명시적으로 거절한 경우에만
  // dismissRepeatRoutePrompt로 영구 저장한다.
  const dismissRepeatRoutePromptSilently = () => {
    closeRepeatRoutePrompt()
  }

  // "다음에요"/X: 이 경로에 대해서는 다시 묻지 않도록 localStorage에 기억해두고 방금 만든
  // 방으로 이동한다. 매번 뜨면 방 나갈 때 프롬프트(11번에서 제거)와 같은 성가심이 된다.
  const dismissRepeatRoutePrompt = () => {
    if (repeatRoutePrompt) {
      window.localStorage.setItem(
        buildRepeatRoutePromptDismissKey(repeatRoutePrompt.from, repeatRoutePrompt.to),
        'true',
      )
    }
    closeRepeatRoutePrompt()
  }

  // 한 번 탭으로 구독을 완료한다 — notify_*를 생략하면 종일·매일 구독이 된다. 실패해도
  // 방 생성 흐름(입장)은 이미 끝난 뒤라 그대로 방으로 이동한다.
  const handleSubscribeRepeatRoute = async () => {
    if (!repeatRoutePrompt) return

    setIsSubscribingRepeatRoute(true)
    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_location: repeatRoutePrompt.from,
          to_location: repeatRoutePrompt.to,
        }),
      })
      const json = await res.json().catch(() => null)

      if (!res.ok) throw new Error(json?.error ?? '경로 알림을 등록하지 못했습니다')

      // design doc(docs/superpowers/specs/2026-08-06-route-subscription-alerts-design.md:570)의
      // canonical 이벤트 계약: route_subscribed { from_location, to_location, source,
      // has_time_window, weekday_count }. source='repeat_route_prompt'로 같은 경로 반복
      // 생성 유도(followup 스펙 8-2)를 다른 유입 지점과 구분한다.
      trackEvent('route_subscribed', {
        from_location: repeatRoutePrompt.from,
        to_location: repeatRoutePrompt.to,
        source: 'repeat_route_prompt',
        has_time_window: false,
        weekday_count: 7,
      })
      toast.success('알림을 받을게요')
    } catch (error) {
      console.error('Repeat route subscribe error:', error)
      toast.error(error instanceof Error ? error.message : '경로 알림을 등록하지 못했습니다')
    } finally {
      setIsSubscribingRepeatRoute(false)
      const roomId = repeatRoutePrompt.roomId
      setRepeatRoutePrompt(null)
      router.push(`/rooms/${roomId}`)
    }
  }

  const broadcastRoomSync = useCallback(async (targetRoomId: string, reason: 'participants') => {
    if (!supabase) return

    const channel = supabase.channel(`room-sync:${targetRoomId}`)

    await new Promise<void>((resolve) => {
      const timeoutId = window.setTimeout(resolve, 900)

      channel.subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return

        window.clearTimeout(timeoutId)
        try {
          await channel.send({
            type: 'broadcast',
            event: 'room-sync',
            payload: {
              reason,
              roomId: targetRoomId,
            },
          })
        } catch (error) {
          console.error('Broadcast room sync error:', error)
        } finally {
          resolve()
        }
      })
    })

    await supabase.removeChannel(channel)
  }, [supabase])

  // handleJoinMapRoom(지도 하단시트 참여)과 중복 방 안내 토스트(promptDuplicateRoom) 양쪽에서
  // 쓰는 공용 참여 로직. room을 mapRooms 조회가 아니라 인자로 직접 받는 이유는, 중복 방 안내는
  // 방금 DB에서 새로 조회한 방(23505 이후) 또는 mapRooms에 이미 있던 방을 그대로 써야 해서다.
  const joinExistingRoom = async (
    room: CampusMapRoom,
    source: 'map_bottom_sheet' | 'duplicate_room_prompt',
  ) => {
    if (isResolvingMapSession) return

    if (!user || !supabase) {
      if (requiresProfile) {
        openProfileRequiredModal('room_join')
      }
      return
    }

    if (isCurrentlySuspended) {
      setModerationModal('suspension')
      return
    }

    try {
      // I-2: 내 방이면 지난 방이어도(정산 채팅이 출발 후에 가장 필요) 그대로 열어야 하므로,
      // isMyRoom 조기 반환을 isRoomJoinable 가드보다 먼저 둔다. join API를 타지 않고
      // router.push만 하므로 서버 가드(app/api/rooms/[id]/join/route.ts)와는 무관하다.
      if (room.participants?.some((participant) => participant.user_id === user.id)) {
        trackEvent('room_reopened', {
          room_id: room.id,
          source,
        })
        router.push(`/rooms/${room.id}`)
        return
      }

      if (!isRoomJoinable(room.departure_date, room.departure_time)) {
        toast.error('이미 지난 출발 시간입니다')
        trackEvent('room_join_blocked', {
          room_id: room.id,
          reason: 'past_departure',
          from_location: room.from_location,
          to_location: room.to_location,
        })
        return
      }

      if ((room.participants?.length ?? 0) >= room.max_participants) {
        toast.error('채팅방이 가득 찼습니다')
        trackEvent('room_join_blocked', {
          room_id: room.id,
          reason: 'full',
          from_location: room.from_location,
          to_location: room.to_location,
        })
        return
      }

      trackEvent('room_join_started', {
        room_id: room.id,
        from_location: room.from_location,
        to_location: room.to_location,
        departure_date: room.departure_date,
        departure_time: room.departure_time,
        source,
      })
      const response = await fetch(`/api/rooms/${room.id}/join`, {
        method: 'POST',
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error ?? '채팅방 참여 중 오류가 발생했습니다')
      }

      await broadcastRoomSync(room.id, 'participants')
      trackEvent('room_joined', {
        room_id: room.id,
        from_location: room.from_location,
        to_location: room.to_location,
        departure_date: room.departure_date,
        departure_time: room.departure_time,
        source,
      })
      router.push(`/rooms/${room.id}`)
    } catch (error) {
      console.error('Join map room error:', error)
      trackEvent('room_join_failed', {
        room_id: room.id,
        source,
      })
      toast.error(error instanceof Error ? error.message : '채팅방 참여 중 오류가 발생했습니다')
    }
  }

  const handleJoinMapRoom = async (roomId: string) => {
    const room = mapRooms.find((mapRoom) => mapRoom.id === roomId)
    if (!room) return
    await joinExistingRoom(room, 'map_bottom_sheet')
  }

  // 같은 경로·같은 출발일시로 이미 열린 active 방이 있을 때 안내하는 토스트.
  // 이용자가 원한 건 "그 시각 그 경로로 이동"이지 방 그 자체가 아니므로, 막기만 하지 않고
  // 이미 있는 방으로 들어갈 수 있게 버튼을 준다 — 단, 자동 입장은 하지 않고 선택은 이용자가 한다.
  const promptDuplicateRoom = (room: CampusMapRoom) => {
    // I-4: 기존 방이 이미 가득 찼으면 "그 방으로 입장해주세요"라고 안내해봐야
    // joinExistingRoom의 정원 가드에 다시 막혀 "채팅방이 가득 찼습니다"라는 모순된
    // 메시지로 막다른 길이 된다. 가득 찬 경우 이동 버튼 자체를 없애고 다른 시각으로
    // 새로 만들라고 안내한다.
    const isFull = isDuplicateRoomFull(room)
    const message = getDuplicateRoomMessage(isFull)

    toast.custom(
      (t) => (
        <DuplicateRoomToastCard
          toast={t}
          message={message}
          isFull={isFull}
          onDismiss={() => toast.dismiss(t.id)}
          onMove={() => {
            toast.dismiss(t.id)
            void joinExistingRoom(room, 'duplicate_room_prompt')
          }}
        />
      ),
      { duration: 6000 },
    )
  }

  const handleGoogleStart = async () => {
    // 인앱 브라우저(에브리타임 등)에서는 Google이 OAuth를 차단(403 disallowed_useragent)하므로
    // OAuth 시도 자체를 막고 외부 브라우저로 유도한다. Android는 Chrome으로 자동 점프.
    const inApp = detectInAppBrowser()
    if (inApp.isInApp) {
      trackEvent('login_blocked_in_app_browser', { is_ios: inApp.isIOS })
      if (inApp.isIOS) {
        toast(
          "에브리타임 안에서는 Google 로그인이 안 돼요.\n우측 상단의 공유 버튼을 눌러 'Safari에서 열기'를 선택해주세요.",
          {
            duration: 2000,
            icon: '📢',
            style: { whiteSpace: 'pre-line' },
          },
        )
      } else {
        escapeInAppBrowser()
      }
      return
    }

    if (!supabase) {
      toast.error('인증 설정을 불러오지 못했습니다')
      return
    }

    setAuthNotice(null)
    setIsStartingGoogle(true)
    trackEvent('login_started', {
      method: 'google',
    })
    rememberPendingLogin('google')
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: getGoogleOAuthOptions(inviteRedirectPath),
      })
      if (error) throw error
    } catch (error) {
      console.error('Google login error:', error)
      toast.error('구글 로그인 중 오류가 발생했습니다')
      window.sessionStorage.removeItem(ANALYTICS_PENDING_LOGIN_KEY)
      setIsStartingGoogle(false)
    }
  }

  const handlePreviewTestLogin = async (accountKey: string) => {
    if (!previewTestLoginEnabled) return

    setAuthNotice(null)
    setStartingPreviewAccountKey(accountKey)
    rememberPendingLogin('preview_test')
    trackEvent('login_started', {
      method: 'preview_test',
      account_key: accountKey,
    })

    try {
      const response = await fetch('/api/auth/preview-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountKey }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error ?? '프리뷰 계정 로그인에 실패했습니다')
      }

      window.location.assign('/map?auth=complete')
    } catch (error) {
      console.error('Preview test login error:', error)
      window.sessionStorage.removeItem(ANALYTICS_PENDING_LOGIN_KEY)
      trackEvent('login_failed', {
        method: 'preview_test',
        account_key: accountKey,
      })
      toast.error(error instanceof Error ? error.message : '프리뷰 계정 로그인에 실패했습니다')
      setStartingPreviewAccountKey(null)
    }
  }

  const handleEnterApp = () => {
    setHasEnteredApp(true)
    trackEvent('map_opened', {
      source: 'landing_cta',
      profile_completed: Boolean(user),
    })
    router.push('/map')
  }

  const handleOpenMyRooms = () => {
    if (isResolvingMapSession) return

    if (requiresProfile) {
      openProfileRequiredModal('my_rooms')
      return
    }

    setShowMyRooms(true)
    trackEvent('my_rooms_opened', {
      source: 'map_header',
    })
    loadMyRooms()
  }

  const openProfileSetup = () => {
    dismissProfileRequiredModal('start_setup')
    trackEvent('profile_setup_started', {
      source: 'profile_required_modal',
    })
    setAuthMode('signup')
  }

  const dismissPwaOnboarding = useCallback((action: 'later' | 'start' | 'outside' | 'confirm' | 'close' = 'later') => {
    trackEvent('pwa_install_instruction_dismissed', {
      action,
    })
    // "Shown today" is already recorded when the prompt opens, so dismissing just
    // closes it; it won't reappear until the next calendar day.
    setShowPwaOnboarding(false)
  }, [])

  const dismissPushPrompt = useCallback((action: 'later' | 'outside' | 'close' | 'enabled' = 'later') => {
    // 한 번 닫으면 다시 띄우지 않는다(설정에서 언제든 켤 수 있음).
    window.localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, 'true')
    setShowPushPrompt(false)
    if (action !== 'enabled') {
      trackEvent('push_prompt_dismissed', { action })
    }
  }, [])

  const handleEnablePush = useCallback(async () => {
    setIsEnablingPush(true)
    try {
      const result = await subscribeToPush()
      if (result.ok) {
        trackEvent('push_enabled', { source: 'installed_home' })
        toast.success('알림이 켜졌어요. 새 메시지를 푸시로 받아볼 수 있어요.')
        dismissPushPrompt('enabled')
      } else if (result.reason === 'denied') {
        trackEvent('push_enable_failed', { reason: 'denied' })
        toast.error('알림이 차단되어 있어요. 기기 설정에서 알림을 허용해주세요.')
        dismissPushPrompt('close')
      } else {
        trackEvent('push_enable_failed', { reason: result.reason })
        toast.error('알림을 켜지 못했어요. 잠시 후 다시 시도해주세요.')
      }
    } finally {
      setIsEnablingPush(false)
    }
  }, [dismissPushPrompt])

  const acknowledgeWarning = async () => {
    if (!moderationStatus?.warning) {
      setModerationModal(null)
      return
    }

    setIsAcknowledgingWarning(true)

    try {
      const response = await fetch('/api/moderation/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: moderationStatus.warning.id }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error ?? '경고 확인을 저장하지 못했습니다')
      }

      setModerationStatus(prev => prev ? { ...prev, warning: null } : prev)
      setModerationModal(null)
    } catch (error) {
      console.error('Acknowledge warning error:', error)
      toast.error(error instanceof Error ? error.message : '경고 확인을 저장하지 못했습니다')
    } finally {
      setIsAcknowledgingWarning(false)
    }
  }

  const handleFindClick = () => {
    toast.error('먼저 로그인하셔야 합니다.');
  };

  const serviceSharePrompt = showServiceSharePrompt ? (
    <ServiceSharePrompt
      isSharing={isSharingService}
      onDismiss={dismissServiceSharePrompt}
      onShare={handleShareService}
    />
  ) : null

  if (loading && !isMapRoute) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
        <p className="text-gray-900 text-lg">로딩 중...</p>
        <p className="text-gray-500 text-sm mt-2">잠시만 기다려주세요</p>
      </div>
    )
  }

  if (authMode === 'signup') {
    return (
      <>
        <SignupForm
          startWithProfileStep={hasAuthenticatedSession}
          onSuccess={() => {
            resetDocumentScrollPosition()
            setAuthMode(null)
            router.push('/map')
            window.requestAnimationFrame(resetDocumentScrollPosition)
            checkAuth(true)
          }}
          onBackToLanding={() => setAuthMode(null)}
        />
      </>
    )
  }

  if (showLanding) {
    return (
      <main className="landing-page">
        <div className="landing-background">
          <Grainient
            className="landing-grainient"
            color1="#9f9fff"
            color2="#2782ff"
            color3="#be97cf"
            timeSpeed={2}
            grainAmount={0.05}
          />
        </div>

        <div className="landing-content">

          <NavigationBar onFindClick={hasAuthenticatedSession ? handleEnterApp : handleFindClick} />

          <div className="landing-hero">
            <SplitText
              text="같이 탈 사람?"
              tag="h1"
              splitType="words, chars"
              className="landing-headline font-bold"
              from={{ opacity: 0, y: 62, scale: 0.82, rotateX: -72, filter: 'blur(10px)' }}
              to={{ opacity: 1, y: 0, scale: 1, rotateX: 0, filter: 'blur(0px)' }}
              duration={0.95}
              delay={45}
              ease="back.out(1.65)"
              style={{
                textShadow: '0 3px 14px rgba(21, 28, 72, 0.30), 0 1px 2px rgba(21, 28, 72, 0.18)',
              }}
            />

            <p style={{
              fontFamily: 'var(--font-paperlogy), sans-serif',
              fontWeight: 500,
              fontSize: '1.125rem', maxWidth: '600px',
              marginBottom: '1rem', color: 'rgba(255, 255, 255, 0.92)',
              textShadow: '0 1px 16px rgba(28, 22, 92, 0.4)'
            }}>
              가천대 학생들을 위한 택시 동승 플랫폼
            </p>

            <div style={{
              display: 'flex',
              position: 'relative',
              width: '100%',
              maxWidth: '320px',
              marginTop: hasAuthenticatedSession ? '1rem' : '6rem',
            }}>
              {!hasAuthenticatedSession && (
                <span id="gachon-account-hint" className="cta-bubble">
                  {GACHON_ACCOUNT_HINT}
                </span>
              )}
              <button
                onClick={hasAuthenticatedSession ? handleEnterApp : handleGoogleStart}
                disabled={!hasAuthenticatedSession && isStartingGoogle}
                aria-describedby={!hasAuthenticatedSession ? 'gachon-account-hint' : undefined}
                style={{
                  width: '100%',
                  minHeight: '3.25rem',
                  padding: '0.875rem 1rem',
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: '#111827',
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 10px 28px rgba(17, 24, 39, 0.10)',
                  cursor: (!hasAuthenticatedSession && isStartingGoogle) ? 'not-allowed' : 'pointer',
                  transition: 'transform 0.2s, opacity 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.625rem',
                  opacity: (!hasAuthenticatedSession && isStartingGoogle) ? 0.7 : 1,
                }}
                onMouseOver={e => {
                  if (!(!hasAuthenticatedSession && isStartingGoogle)) e.currentTarget.style.transform = 'scale(1.03)'
                }}
                onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                {!hasAuthenticatedSession && <GoogleIcon />}
                {hasAuthenticatedSession ? '바로 시작하기' : (isStartingGoogle ? 'Google로 이동 중...' : 'Google로 3초 안에 시작하기')}
              </button>
            </div>

            {authNotice && !hasAuthenticatedSession && (
              <div role="alert" className="auth-notice">
                {authNotice}
              </div>
            )}

            {previewTestLoginEnabled && !hasAuthenticatedSession && (
              <div
                aria-label="프리뷰 계정"
                className="grid w-full max-w-xs grid-cols-3 gap-2 rounded-lg border border-white/20 bg-white/10 p-2 backdrop-blur"
              >
                {PREVIEW_TEST_ACCOUNTS.map((account) => {
                  const isStarting = startingPreviewAccountKey === account.key

                  return (
                    <button
                      key={account.key}
                      type="button"
                      onClick={() => handlePreviewTestLogin(account.key)}
                      disabled={Boolean(startingPreviewAccountKey) || isStartingGoogle}
                      className="min-h-10 rounded-lg border border-white/25 bg-white/90 px-2 text-sm font-black text-gray-950 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isStarting ? '입장 중...' : account.nickname}
                    </button>
                  )
                })}
              </div>
            )}

          </div>

          <div className="landing-footer">
            <Link href="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>
              개인정보처리방침
            </Link>
            <Link href="/terms" style={{ color: 'inherit', textDecoration: 'underline' }}>
              서비스약관
            </Link>
          </div>
        </div>
        {serviceSharePrompt}
      </main>
    )
  }

  return (
    <main
      className="relative w-screen overflow-hidden bg-[#e7edf4]"
      style={{ height: 'var(--map-viewport-height)' }}
    >
      <CampusRouteMap
        rooms={mapRooms}
        onlineCount={onlineDisplayCount}
        currentUserId={user?.id}
        isDormitoryResident={user?.is_dormitory_resident === true}
        selectedFrom={fromLocation}
        isCreatingRoom={isCreatingMapRoom}
        isLoading={isLoadingMapRooms}
        onSelectFrom={handleFromLocationChange}
        onCreateRoom={handleCreateMapRoom}
        onJoinRoom={handleJoinMapRoom}
        routeHintStep={routeCoachStep}
        onCloseRouteHint={endRouteCoachmark}
        onOpenRoutes={() => {
          if (requiresProfile) {
            openProfileRequiredModal('routes')
            return
          }
          router.push('/routes')
        }}
        hasUnseenRouteRooms={hasUnseenRouteRooms}
        onOpenRouteSubscribe={(from) => {
          if (requiresProfile) {
            openProfileRequiredModal('route_subscribe')
            return
          }
          // 도착지는 아직 정해지지 않았으므로 /routes에서 고르게 한다.
          router.push(`/routes?from=${encodeURIComponent(from)}`)
        }}
      />

      {serviceSharePrompt}

      {showMyRooms && (
        <div
          className="absolute inset-0 z-50 flex items-start justify-end bg-gray-950/25 px-3 pt-24"
          onClick={() => setShowMyRooms(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-white/80 bg-white/95 p-4 shadow-[0_18px_48px_rgba(17,24,39,0.22)] backdrop-blur"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-gray-950">나의 방</h2>
                <p className="text-xs font-semibold text-gray-500">내가 참여 중인 채팅방</p>
              </div>
              <button
                type="button"
                aria-label="나의 방 닫기"
                onClick={() => setShowMyRooms(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-950"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {isLoadingMyRooms ? (
              <div className="flex items-center justify-center py-8">
                <div className="loading-spinner" />
              </div>
            ) : myRooms.length > 0 ? (
              <div className="max-h-[54vh] space-y-2 overflow-y-auto pr-1">
                {myRooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    aria-label={`${LOCATIONS[room.from_location]}에서 ${LOCATIONS[room.to_location]} ${room.departure_date.slice(5).replace('-', '/')} ${room.departure_time.slice(0, 5)} 나의 방${room.unread_count > 0 ? `, 안 읽은 메시지 ${room.unread_count > 99 ? '99+' : room.unread_count}개` : ''}`}
                    onClick={() => router.push(`/rooms/${room.id}`)}
                    className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-3 text-left transition hover:border-primary-100 hover:bg-primary-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-black text-gray-950">
                        <Clock className="h-4 w-4 text-primary-600" />
                        {room.departure_date.slice(5).replace('-', '/')} {room.departure_time.slice(0, 5)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-black text-gray-500">
                        <Users className="h-3.5 w-3.5" />
                        {room.participants?.length ?? 0}/{room.max_participants}
                      </span>
                    </div>
                    <div className="mt-1 flex min-w-0 items-center gap-1 text-xs font-bold text-gray-600">
                      <span className="truncate">{LOCATIONS[room.from_location]}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="truncate">{LOCATIONS[room.to_location]}</span>
                      {room.unread_count > 0 && (
                        <span className="ml-auto inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-black leading-none text-white">
                          {room.unread_count > 99 ? '99+' : room.unread_count}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-8 text-center text-sm font-bold text-gray-500">
                참여 중인 방이 없습니다
              </div>
            )}
          </div>
        </div>
      )}

      {/* 8-2: 같은 경로로 방을 2회 이상 만들었을 때(방 생성 직후) 구독 유도 */}
      {repeatRoutePrompt && (
        <div
          className="fixed inset-0 z-[60] flex items-end bg-gray-950/35 px-3 pb-3 pt-16"
          onClick={() => {
            // 배경 탭은 실수로 누르기 쉬우므로 영구 거절로 기록하지 않는다(persist는
            // X/"다음에요"에서만). 간단히 닫고 방으로 이동만 한다.
            if (!isSubscribingRepeatRoute) dismissRepeatRoutePromptSilently()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="repeat-route-prompt-title"
            className="w-full rounded-2xl bg-white p-4 shadow-2xl"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
            onClick={(event) => event.stopPropagation()}
          >
            {/* 닫기 버튼을 헤드라인과 같은 행에 두면 52px 만큼 글자 폭이 줄어 잘린다.
                버튼은 짧은 eyebrow 와만 행을 나눠 쓰고, 헤드라인은 카드 폭을 다 쓴다. */}
            <div className="mb-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.08em] text-primary-600">알림 받기</p>
                <button
                  type="button"
                  aria-label="닫기"
                  onClick={dismissRepeatRoutePrompt}
                  disabled={isSubscribingRepeatRoute}
                  className="-mr-2 -mt-2.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {/* 좁은 기기에서도 한 줄을 유지하려고 글자 크기를 카드 안쪽 폭(오버레이
                  px-3 + 카드 p-4 = 56px 제외)에 연동한다. 이 문구는 실제 서체에서 17.98em
                  폭이라 폴백 서체 여유를 5% 두고 19 로 나눴다. 상한은 기존 text-lg 와 같다. */}
              <h2
                id="repeat-route-prompt-title"
                className="mt-0.5 whitespace-nowrap font-black leading-snug tracking-[-0.02em] text-gray-950"
                style={{ fontSize: 'min(1.125rem, calc((100vw - 56px) / 19))' }}
              >
                이 경로에 방이 생기면 알림을 받아보시겠어요?
              </h2>
            </div>

            <div className="flex gap-2 rounded-xl border border-primary-100 bg-primary-50 px-3 py-2.5">
              <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
              <p className="text-sm font-bold leading-5 text-gray-700">
                다음에{' '}
                <span className="font-black text-gray-950">
                  {LOCATIONS[repeatRoutePrompt.from]} → {LOCATIONS[repeatRoutePrompt.to]}
                </span>
                {' '}경로에 방이 열리면 알려드릴게요.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSubscribeRepeatRoute}
                disabled={isSubscribingRepeatRoute}
                className="inline-flex h-12 items-center justify-center rounded-xl bg-primary-600 text-sm font-black text-white transition hover:bg-primary-700 disabled:bg-gray-300"
              >
                {isSubscribingRepeatRoute ? '등록 중...' : '알림 받을게요'}
              </button>
              <button
                type="button"
                onClick={dismissRepeatRoutePrompt}
                disabled={isSubscribingRepeatRoute}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-gray-300 bg-white text-sm font-black text-gray-800 transition hover:border-gray-400 disabled:opacity-50"
              >
                다음에요
              </button>
            </div>
          </div>
        </div>
      )}

      {showPwaOnboarding && (
        <div
          className="fixed inset-x-0 top-0 z-[60] flex items-end bg-gray-950/30 px-3 pb-3 pt-20"
          style={{ height: 'var(--app-viewport-height)' }}
          onClick={() => dismissPwaOnboarding('outside')}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-onboarding-title"
            className="mx-auto w-full max-w-sm rounded-lg border border-white/80 bg-white p-4 shadow-[0_18px_48px_rgba(17,24,39,0.24)]"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.02em] text-primary-600">알림 받기</p>
                <h2 id="pwa-onboarding-title" className="mt-1 whitespace-nowrap text-base font-black leading-tight tracking-tight text-gray-950">
                  지금 홈 화면에 추가하고 알림을 받으세요
                </h2>
              </div>
              <button
                type="button"
                aria-label="홈 화면 추가 안내 닫기"
                onClick={() => dismissPwaOnboarding('close')}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-950"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-primary-100 bg-primary-50 px-3 py-2.5">
                <Bell className="h-4 w-4 shrink-0 text-primary-600" />
                <p className="whitespace-nowrap text-xs font-bold text-gray-700">
                  동승자가 채팅을 보내면 <span className="font-black text-gray-950">푸시 알림</span>을 받을 수 있어요
                </p>
              </div>
              <div className="flex gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                <p className="text-xs font-bold leading-5 text-gray-700">
                  iPhone에서는 브라우저의 공유
                  <Share2 className="mx-1 inline h-3.5 w-3.5 align-[-2px] text-primary-600" aria-hidden="true" />
                  버튼을 누른 뒤 홈 화면에 추가를 선택하세요.
                </p>
              </div>
              <div className="flex gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <Star className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                <p className="text-xs font-bold leading-5 text-gray-700">
                  Android에서는 브라우저 메뉴에서 홈 화면에 추가 또는 앱 설치를 선택하면 됩니다.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => dismissPwaOnboarding('confirm')}
                className="h-11 w-full rounded-lg bg-gray-950 text-sm font-black text-white transition hover:bg-gray-800"
              >
                확인했어요
              </button>
            </div>
          </div>
        </div>
      )}

      {showPushPrompt && (
        <div
          className="fixed inset-x-0 top-0 z-[60] flex items-end bg-gray-950/30 px-3 pb-3 pt-20"
          style={{ height: 'var(--app-viewport-height)' }}
          onClick={() => dismissPushPrompt('outside')}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="push-prompt-title"
            className="mx-auto w-full max-w-sm rounded-lg border border-white/80 bg-white p-4 shadow-[0_18px_48px_rgba(17,24,39,0.24)]"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.02em] text-primary-600">채팅 알림</p>
                <h2 id="push-prompt-title" className="mt-1 text-lg font-black text-gray-950">
                  새 메시지 알림을 켤까요?
                </h2>
              </div>
              <button
                type="button"
                aria-label="알림 안내 닫기"
                onClick={() => dismissPushPrompt('close')}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-950"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex gap-2 rounded-lg border border-primary-100 bg-primary-50 px-3 py-2">
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
              <p className="text-xs font-bold leading-5 text-gray-700">
                동승자가 채팅을 보내면 앱을 열지 않아도 <span className="font-black text-gray-950">푸시 알림</span>으로 바로 받아볼 수 있어요.
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => dismissPushPrompt('later')}
                className="h-11 flex-1 rounded-lg border border-gray-200 text-sm font-black text-gray-700 transition hover:bg-gray-50"
              >
                나중에
              </button>
              <button
                type="button"
                onClick={handleEnablePush}
                disabled={isEnablingPush}
                className="h-11 flex-1 rounded-lg bg-gray-950 text-sm font-black text-white transition hover:bg-gray-800 disabled:bg-gray-300"
              >
                {isEnablingPush ? '켜는 중...' : '알림 켜기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfileRequiredModal && (
        <div
          className="fixed inset-x-0 top-0 z-[70] flex items-end bg-gray-950/30 px-3 pb-3 pt-24"
          style={{ height: 'var(--app-viewport-height)' }}
          onClick={() => dismissProfileRequiredModal('outside')}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-required-title"
            className="mx-auto w-full max-w-sm rounded-lg border border-white/80 bg-white p-4 shadow-[0_18px_48px_rgba(17,24,39,0.24)]"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.02em] text-primary-600">프로필 미완료</p>
                <h2 id="profile-required-title" className="mt-1 text-lg font-black leading-6 text-gray-950">
                  프로필 세팅을 먼저 완료해주세요
                </h2>
              </div>
              <button
                type="button"
                aria-label="프로필 안내 닫기"
                onClick={() => dismissProfileRequiredModal('close')}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-950"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-3 text-sm font-semibold leading-5 text-gray-600">
              프로필 세팅 이후 &lt;같이타&gt;를 이용할 수 있어요.
            </p>

            <button
              type="button"
              onClick={openProfileSetup}
              className="mt-4 h-12 w-full rounded-lg bg-gray-950 text-sm font-black text-white transition hover:bg-gray-800"
            >
              프로필 세팅하기
            </button>
          </div>
        </div>
      )}

      {moderationModal && (
        <div
          className="fixed inset-x-0 top-0 z-[80] flex items-end bg-gray-950/35 px-3 pb-3 pt-24"
          style={{ height: 'var(--app-viewport-height)' }}
          onClick={() => setModerationModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="moderation-modal-title"
            className="mx-auto w-full max-w-sm rounded-lg border border-white/80 bg-white p-4 shadow-[0_18px_48px_rgba(17,24,39,0.24)]"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                moderationModal === 'suspension' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
              }`}>
                {moderationModal === 'suspension' ? <Ban className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-black tracking-[0.02em] ${
                  moderationModal === 'suspension' ? 'text-rose-600' : 'text-amber-600'
                }`}>
                  운영 안내
                </p>
                <h2 id="moderation-modal-title" className="mt-1 text-lg font-black leading-6 text-gray-950">
                  {moderationModal === 'suspension' ? '서비스 이용이 정지되었습니다' : '운영 경고가 도착했습니다'}
                </h2>
              </div>
            </div>

            {moderationModal === 'suspension' ? (
              <div className="mt-4 rounded-lg border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-bold leading-5 text-rose-800">
                <p>
                  {activeSuspendedUntil
                    ? `${formatKoreanDateTime(activeSuspendedUntil)}까지 고정지점 선택, 방 생성, 입장을 이용할 수 없습니다.`
                    : '현재 고정지점 선택, 방 생성, 입장을 이용할 수 없습니다.'}
                </p>
                {activeSuspensionReason && <p className="mt-2 text-xs font-semibold leading-5 text-rose-700">{activeSuspensionReason}</p>}
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-3 text-sm font-bold leading-5 text-amber-900">
                {moderationStatus?.warning?.reason || '서비스 이용 경고가 접수되었습니다.'}
              </div>
            )}

            <button
              type="button"
              onClick={moderationModal === 'warning' ? acknowledgeWarning : () => setModerationModal(null)}
              disabled={isAcknowledgingWarning}
              className="mt-4 h-12 w-full rounded-lg bg-gray-950 text-sm font-black text-white transition hover:bg-gray-800 disabled:bg-gray-300"
            >
              {isAcknowledgingWarning ? '저장 중...' : '확인했어요'}
            </button>
          </div>
        </div>
      )}

      <header
        ref={mapHeaderRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-40 px-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="pointer-events-auto mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-lg border border-white/75 bg-white/90 px-3 py-2.5 shadow-[0_12px_34px_rgba(17,24,39,0.14)] backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <Image
              src="/brand/gatita-logo.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 shrink-0"
              priority
            />
            <div className="min-w-0">
              <h1 className="text-base font-black text-gray-950">같이타</h1>
              <p className="truncate text-xs font-semibold text-gray-600">{mapGreetingText}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={unreadCount > 0 ? `나의 방, 안 읽은 메시지 ${unreadCount > 99 ? '99+' : unreadCount}개` : '나의 방'}
              onClick={handleOpenMyRooms}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 hover:text-gray-950"
            >
              <MessageSquareText className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-none text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              aria-label="설정"
              onClick={() => {
                if (isResolvingMapSession) return

                if (requiresProfile) {
                  openProfileRequiredModal('settings')
                  return
                }

                router.push('/settings')
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 hover:text-gray-950"
            >
              <Settings className="h-5 w-5" />
            </button>
            {user?.is_admin && (
              <button
                type="button"
                aria-label="관리자 페이지"
                onClick={() => router.push('/admin')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600 transition hover:bg-red-100"
              >
                <Star className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </header>
    </main>
  )
}
