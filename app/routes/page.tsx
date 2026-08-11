'use client'

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  LOCATIONS,
  LOCATION_ORDER,
  getDestinationOptions,
  getMapRoomDateRange,
  isRestrictedRoutePair,
  isRoomJoinable,
  ROUTE_TOO_CLOSE_MESSAGE,
  type LocationType,
  type User,
} from '@/lib/supabase'
import { getNotificationPermission } from '@/lib/push'
import { isInstalled } from '@/lib/pwa'
import { trackEvent } from '@/lib/analytics/client'
import {
  ROUTES_SEEN_STORAGE_KEY,
  WEEKDAY_LABELS,
  WEEKDAY_PRESETS,
  isValidNotifyWindow,
  summarizeWeekdays,
  summarizeWindow,
  toNotifyTimeSeconds,
  weekdaysEqual,
} from '@/lib/routeSummary'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BellOff,
  BellRing,
  Clock,
  Plus,
  Share2,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'

type RouteSubscriptionRow = {
  id: string
  from_location: LocationType
  to_location: LocationType
  notify_enabled: boolean
  notify_from: string | null
  notify_to: string | null
  notify_weekdays: number[]
}

type OpenRoom = {
  id: string
  from_location: LocationType
  to_location: LocationType
  departure_date: string
  departure_time: string
  max_participants: number
  participants?: { id: string }[]
}

// 고정지점은 LOCATION_ORDER(제3기숙사 제외)만 노출한다. LOCATIONS는 전체 맵(제3기숙사
// 포함)이라 그대로 순회하면 선택할 수 없는 지점이 드롭다운에 뜬다.
const LOCATION_ENTRIES: [LocationType, string][] = LOCATION_ORDER.map((location) => [location, LOCATIONS[location]])

const DEFAULT_WINDOW = { from: '17:00', to: '20:00' }

const WEEKDAY_PRESET_OPTIONS: { label: string; days: number[] }[] = [
  { label: '매일', days: [...WEEKDAY_PRESETS.everyday] },
  { label: '평일', days: [...WEEKDAY_PRESETS.weekday] },
  { label: '주말', days: [...WEEKDAY_PRESETS.weekend] },
]

// route_subscribed의 source 값. 다른 유입 지점(지도 하단 시트의 벨 아이콘, 방 생성 반복
// 유도 등)과 구분해 이 화면(경로 추가 폼)에서 만든 구독임을 알 수 있게 한다.
const ROUTE_SUBSCRIBE_SOURCE = 'routes_page'

function routeKey(from: LocationType, to: LocationType) {
  return `${from}>${to}`
}

// useSearchParams()(?from= 프리필용)를 쓰려면 Next.js가 이 컴포넌트를 Suspense 경계
// 안에서 렌더링해야 한다 — 없으면 정적 프리렌더가 실패한다(next build에서 실측 확인).
export default function RoutesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="loading-spinner" />
        </div>
      }
    >
      <RoutesPageContent />
    </Suspense>
  )
}

function RoutesPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  // 안내 메일 CTA(lib/route-alert-email.ts)가 ?utm_campaign=route_alerts로 이 화면에
  // 들어온다. "안내 메일 → 구독 전환율" 지표(design doc 550행)를 재려면 route_subscribed에
  // 이 값을 실어야 하므로, 진입 시점 쿼리를 한 번 읽어 상태로 고정해둔다(폼 제출 시점에는
  // 쿼리가 없을 수도 있으므로 useSearchParams()를 그때 다시 읽지 않는다).
  const [utmCampaign] = useState(() => searchParams.get('utm_campaign'))

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const [routes, setRoutes] = useState<RouteSubscriptionRow[]>([])
  const [busyRouteIds, setBusyRouteIds] = useState<Set<string>>(new Set())

  const [openRooms, setOpenRooms] = useState<OpenRoom[]>([])
  const [openRoomsLoading, setOpenRoomsLoading] = useState(false)
  // "내 경로에 열린 방" 섹션을 없애고 구독 카드에 뱃지로 통합했다(사용자 피드백). 방이
  // 2개 이상이면 카드 안에서 목록을 펼쳐 보여줘야 하므로, 어떤 route.id가 펼쳐졌는지만
  // 로컬에 둔다(서버 상태 아님 — 화면을 나가면 잊혀도 무방).
  const [expandedRouteIds, setExpandedRouteIds] = useState<Set<string>>(new Set())

  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [installed, setInstalled] = useState(false)
  const [showInstallSheet, setShowInstallSheet] = useState(false)

  // 경로 추가 폼 상태. 지도 하단 시트의 "이 경로 알림 받기"(CampusRouteMap)는 도착지가
  // 아직 정해지지 않은 상태로 넘어오므로, ?from= 쿼리로 출발지만 미리 채워 도착지 선택만
  // 남겨둔다.
  const [formFrom, setFormFrom] = useState<LocationType | ''>(() => {
    const from = searchParams.get('from')
    return from && from in LOCATIONS ? (from as LocationType) : ''
  })
  const [formTo, setFormTo] = useState<LocationType | ''>('')
  const [formAllDay, setFormAllDay] = useState(true)
  const [formWindow, setFormWindow] = useState(DEFAULT_WINDOW)
  const [formWeekdays, setFormWeekdays] = useState<number[]>([...WEEKDAY_PRESETS.everyday])
  const [formSubmitting, setFormSubmitting] = useState(false)

  const loadRoutes = useCallback(async (): Promise<RouteSubscriptionRow[]> => {
    const res = await fetch('/api/routes')
    const json = await res.json().catch(() => null) as { routes?: RouteSubscriptionRow[] } | null
    const nextRoutes = json?.routes ?? []
    setRoutes(nextRoutes)
    return nextRoutes
  }, [])

  const loadOpenRooms = useCallback(
    async (currentRoutes: RouteSubscriptionRow[]) => {
      if (currentRoutes.length === 0) {
        setOpenRooms([])
        return
      }

      setOpenRoomsLoading(true)
      try {
        // 구독한 경로들에 대해 오늘·내일 활성 방을 조회하고, 입장 가능한 것만 보여준다.
        // 푸시가 닿는 이용자가 사실상 10명뿐이라(설치율 병목) 이 폴백 조회가 주 경로다.
        const { data } = await supabase
          .from('chat_rooms')
          .select('id, from_location, to_location, departure_date, departure_time, max_participants, participants:room_participants(id)')
          .in('departure_date', getMapRoomDateRange(new Date()))
          .eq('status', 'active')
          .order('departure_time', { ascending: true })

        const myRouteKeys = new Set(currentRoutes.map((r) => routeKey(r.from_location, r.to_location)))
        const filtered = ((data ?? []) as OpenRoom[]).filter(
          (room) =>
            myRouteKeys.has(routeKey(room.from_location, room.to_location)) &&
            isRoomJoinable(room.departure_date, room.departure_time),
        )
        setOpenRooms(filtered)

        // design doc(...design.md:573)의 route_alert_fallback_seen { room_count } — 앱 내
        // 폴백(이 섹션)이 실제로 얼마나 노출되고, 그때 몇 개 방이 보였는지를 잰다. 푸시가
        // 닿는 이용자가 10명뿐이라 이 폴백이 사실상 주 경로다.
        trackEvent('route_alert_fallback_seen', { room_count: filtered.length })

        // 미확인 표시용 시각 저장. 서버 상태는 두지 않는다 — 이 화면을 열어봤다는
        // 사실만 로컬에 남겨, 추후 FAB 등에서 "새로 열린 방" 배지 판정에 쓸 수 있게 한다.
        window.localStorage.setItem(ROUTES_SEEN_STORAGE_KEY, new Date().toISOString())
      } catch (error) {
        console.error('Load open rooms error:', error)
      } finally {
        setOpenRoomsLoading(false)
      }
    },
    [supabase],
  )

  const refreshPushStatus = useCallback(() => {
    setPushPermission(getNotificationPermission())
    setInstalled(isInstalled())
  }, [])

  const checkAuthAndLoadData = useCallback(async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()

      if (!authUser) {
        router.push('/')
        return
      }

      const profileResponse = await fetch('/api/profile/me')
      const profileResult = await profileResponse.json().catch(() => null) as {
        profileCompleted?: boolean
        user?: User | null
        error?: string
      } | null

      if (!profileResponse.ok) {
        throw new Error(profileResult?.error ?? '프로필을 확인하지 못했습니다')
      }

      if (!profileResult?.profileCompleted || !profileResult.user) {
        router.push('/')
        return
      }

      setUser(profileResult.user)
      const loadedRoutes = await loadRoutes()
      refreshPushStatus()
      await loadOpenRooms(loadedRoutes)
    } catch (error) {
      console.error('Routes page auth/data loading error:', error)
      router.push('/')
    } finally {
      setLoading(false)
    }
  }, [loadOpenRooms, loadRoutes, refreshPushStatus, router, supabase])

  useEffect(() => {
    checkAuthAndLoadData()
  }, [checkAuthAndLoadData])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshPushStatus()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [refreshPushStatus])

  // ---- 구독 목록: 토글·삭제 ----

  const setRouteBusy = (id: string, busy: boolean) => {
    setBusyRouteIds((prev) => {
      const next = new Set(prev)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleToggleNotify = async (route: RouteSubscriptionRow) => {
    const nextEnabled = !route.notify_enabled
    setRouteBusy(route.id, true)
    setRoutes((prev) => prev.map((r) => (r.id === route.id ? { ...r, notify_enabled: nextEnabled } : r)))

    try {
      const res = await fetch(`/api/routes/${route.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notify_enabled: nextEnabled }),
      })
      const json = await res.json().catch(() => null)

      if (!res.ok) throw new Error(json?.error ?? '알림 설정을 변경하지 못했습니다')

      // push_enabled/push_disabled(설정 화면)와 같은 컨벤션: 방향마다 별도 이벤트 이름.
      trackEvent(nextEnabled ? 'route_notify_enabled' : 'route_notify_disabled', {
        route_id: route.id,
        from_location: route.from_location,
        to_location: route.to_location,
      })
    } catch (error) {
      // 실패 시 낙관적 업데이트를 되돌린다
      setRoutes((prev) => prev.map((r) => (r.id === route.id ? { ...r, notify_enabled: route.notify_enabled } : r)))
      toast.error(error instanceof Error ? error.message : '알림 설정을 변경하지 못했습니다')
    } finally {
      setRouteBusy(route.id, false)
    }
  }

  const handleDeleteRoute = async (route: RouteSubscriptionRow) => {
    const label = `${LOCATIONS[route.from_location]} → ${LOCATIONS[route.to_location]}`
    if (!window.confirm(`${label} 경로 알림을 삭제할까요?`)) return

    setRouteBusy(route.id, true)
    try {
      const res = await fetch(`/api/routes/${route.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => null)

      if (!res.ok) throw new Error(json?.error ?? '경로를 삭제하지 못했습니다')

      let nextRoutes: RouteSubscriptionRow[] = []
      setRoutes((prev) => {
        nextRoutes = prev.filter((r) => r.id !== route.id)
        return nextRoutes
      })
      // design doc(docs/superpowers/specs/2026-08-06-route-subscription-alerts-design.md:571)의
      // canonical 이벤트 계약: route_unsubscribed { from_location, to_location }.
      trackEvent('route_unsubscribed', {
        from_location: route.from_location,
        to_location: route.to_location,
      })
      toast.success('경로를 삭제했어요')
      // 추가 경로(handleSubmitForm)와 대칭: 삭제로 구독 집합이 바뀌었으니 폴백 목록도 다시 계산한다.
      // 그렇지 않으면 방금 알림을 끈 경로의 방 카드가 stale 상태로 계속 보인다.
      await loadOpenRooms(nextRoutes)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '경로를 삭제하지 못했습니다')
    } finally {
      setRouteBusy(route.id, false)
    }
  }

  // ---- 경로 추가 폼 ----

  const isRestrictedSelection = formFrom !== '' && formTo !== '' && isRestrictedRoutePair(formFrom, formTo)
  const isSameLocationSelection = formFrom !== '' && formFrom === formTo
  // "직접 설정"일 때만 의미 있는 검증. 출발지/도착지 충돌과 같은 패턴으로, 값을 몰래
  // 보정하지 않고 인라인 에러를 띄운 뒤 저장 버튼을 막는다.
  const isSameTimeSelection = !formAllDay && !isValidNotifyWindow(formWindow.from, formWindow.to)
  const canSubmitForm =
    formFrom !== '' &&
    formTo !== '' &&
    !isSameLocationSelection &&
    !isRestrictedSelection &&
    !isSameTimeSelection &&
    formWeekdays.length > 0 &&
    !formSubmitting

  const handleFromChange = (value: LocationType | '') => {
    setFormFrom(value)
    // 도착지가 새 출발지와 같거나 근거리 제한에 걸리면, 잘못된 조합이 남지 않도록 초기화한다.
    if (value !== '' && formTo !== '' && (formTo === value || isRestrictedRoutePair(value, formTo))) {
      setFormTo('')
    }
  }

  const handleWeekdayPreset = (preset: number[]) => {
    setFormWeekdays([...preset])
  }

  const toggleWeekday = (day: number) => {
    setFormWeekdays((prev) => {
      if (prev.includes(day)) {
        // 마지막 하나 남은 요일은 끄지 못하게 막는다 — 요일이 0개인 구독은 절대 알림이 오지 않는다.
        if (prev.length === 1) return prev
        return prev.filter((d) => d !== day)
      }
      return [...prev, day].sort((a, b) => a - b)
    })
  }

  const handleWindowChange = (field: 'from' | 'to', value: string) => {
    // 값을 몰래 보정하지 않는다 — 사용자가 고른 값을 그대로 반영하고, 시작=종료가 되면
    // isSameTimeSelection이 인라인 에러를 띄우고 저장을 막는다(출발지/도착지 충돌과 동일 패턴).
    setFormWindow((prev) => ({ ...prev, [field]: value }))
  }

  const resetForm = () => {
    setFormFrom('')
    setFormTo('')
    setFormAllDay(true)
    setFormWindow(DEFAULT_WINDOW)
    setFormWeekdays([...WEEKDAY_PRESETS.everyday])
  }

  const handleSubmitForm = async () => {
    // canSubmitForm 자체가 formFrom/formTo !== '' 를 포함하는 조건이라, 이 체크 하나로
    // 아래에서 formFrom/formTo를 LocationType으로 안전하게 쓸 수 있다.
    if (!canSubmitForm) return

    setFormSubmitting(true)
    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_location: formFrom,
          to_location: formTo,
          notify_from: formAllDay ? null : toNotifyTimeSeconds(formWindow.from),
          notify_to: formAllDay ? null : toNotifyTimeSeconds(formWindow.to),
          notify_weekdays: formWeekdays,
        }),
      })
      const json = await res.json().catch(() => null)

      if (!res.ok) throw new Error(json?.error ?? '경로를 추가하지 못했습니다')

      const savedRoute = json.route as RouteSubscriptionRow
      let nextRoutes: RouteSubscriptionRow[] = []
      setRoutes((prev) => {
        const idx = prev.findIndex((r) => r.id === savedRoute.id)
        nextRoutes = idx === -1 ? [...prev, savedRoute] : prev.map((r, i) => (i === idx ? savedRoute : r))
        return nextRoutes
      })

      // design doc(docs/superpowers/specs/2026-08-06-route-subscription-alerts-design.md:570)의
      // canonical 이벤트 계약: route_subscribed { from_location, to_location, source,
      // has_time_window, weekday_count }. has_time_window/weekday_count는 이 기능의 성패
      // 지표(대부분 종일이면 시간대 설계가 과잉, 다수가 설정하면 초안 판단이 틀렸음을 확인)라
      // 반드시 채운다. source는 지도 하단 시트, 반복 방 생성 유도 등 다른 유입 지점과
      // 구분하기 위한 값이다.
      // utm_campaign이 안내 메일 것(route_alerts)이면 source를 'feature_email'로 덮어써
      // "안내 메일 → 구독 전환율"을 amplitude에서 곧바로 집계할 수 있게 한다. utm_campaign
      // 자체도 함께 실어 다른 캠페인 유입도 나중에 구분할 수 있게 한다 — null이면
      // sanitizeProperties(lib/analytics/client.ts)가 걸러내 프로퍼티에서 아예 빠진다.
      trackEvent('route_subscribed', {
        from_location: savedRoute.from_location,
        to_location: savedRoute.to_location,
        source: utmCampaign === 'route_alerts' ? 'feature_email' : ROUTE_SUBSCRIBE_SOURCE,
        utm_campaign: utmCampaign,
        has_time_window: !formAllDay,
        weekday_count: formWeekdays.length,
      })
      toast.success('알림 경로를 추가했어요')
      resetForm()
      await loadOpenRooms(nextRoutes)

      // 구독은 만들어졌지만 미설치 상태면 푸시가 이 기기에 닿지 않는다(iOS는 홈 화면 추가
      // 없이 웹 푸시 자체가 불가능). 권한을 새로 묻지 않고 기존 설치 안내 시트만 띄운다 —
      // 병목은 프롬프트가 아니라 설치율이라는 진단(design doc 3장)에 따른 것.
      if (!installed) {
        setShowInstallSheet(true)
        trackEvent('pwa_install_instruction_shown', { source: 'route_subscribe' })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '경로를 추가하지 못했습니다')
    } finally {
      setFormSubmitting(false)
    }
  }

  // ---- 폴백: 구독 카드에 통합된 "열린 방" ----

  // 경로별로 그룹핑해서 각 구독 카드가 자기 경로에 열린 방만 뱃지로 보여줄 수 있게 한다.
  const openRoomsByRouteKey = useMemo(() => {
    const map = new Map<string, OpenRoom[]>()
    for (const room of openRooms) {
      const key = routeKey(room.from_location, room.to_location)
      const list = map.get(key)
      if (list) list.push(room)
      else map.set(key, [room])
    }
    return map
  }, [openRooms])

  const handleOpenRoomClick = (room: OpenRoom) => {
    // design doc(...design.md:571)의 canonical 이벤트 계약: 알림 → 방 입장 전환율을
    // 재는 지표라, 뱃지에서 바로 열든 펼친 목록에서 열든 이 지점 하나로 통일한다.
    trackEvent('route_alert_opened', {
      room_id: room.id,
      from_location: room.from_location,
      to_location: room.to_location,
    })
    router.push(`/rooms/${room.id}`)
  }

  // 뱃지 탭: 방이 하나면 고를 게 없으니 바로 그 방으로 이동하고, 여러 개면 카드 안에서
  // 목록을 펼쳐 출발 시각·인원을 보고 고르게 한다.
  const handleRouteRoomsBadgeClick = (route: RouteSubscriptionRow, rooms: OpenRoom[]) => {
    if (rooms.length <= 1) {
      if (rooms[0]) handleOpenRoomClick(rooms[0])
      return
    }
    setExpandedRouteIds((prev) => {
      const next = new Set(prev)
      if (next.has(route.id)) next.delete(route.id)
      else next.add(route.id)
      return next
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (!user) return null

  const showPermissionBanner = pushPermission !== 'granted'

  return (
    <div className="min-h-screen app-bg">
      <header
        className="app-header px-4 pb-4"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center">
          <button
            type="button"
            aria-label="이전 화면으로"
            onClick={() => router.push('/map')}
            className="mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold">알림 경로</h1>
        </div>
      </header>

      <main className="settings-shell">
        {/* 처음 들어온 이용자가 이 화면이 뭘 하는 곳인지 한눈에 알 수 있도록 첫 섹션 위에
            헤드라인을 둔다(사용자 피드백). 헤더 아래 · 첫 섹션(권한 배너 포함) 위에 항상 노출. */}
        <h2 className="routes-headline">자주 가는 경로는 알림을 받아 보세요</h2>

        {showPermissionBanner && (
          <section className="settings-section settings-section-tight" aria-labelledby="routes-push-banner">
            <div className="flex items-start gap-2.5">
              <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p id="routes-push-banner" className="text-[0.8rem] font-extrabold text-gray-950">
                  {installed ? '알림이 꺼져 있어요' : '홈 화면에 추가해야 알림을 받을 수 있어요'}
                </p>
                <p className="mt-0.5 text-[0.72rem] font-semibold leading-5 text-gray-500">
                  {!installed
                    ? 'iOS는 홈 화면에 추가해야 푸시 알림을 받을 수 있어요. 아래 "내 경로에 열린 방"에서도 새 방을 바로 확인할 수 있어요.'
                    : pushPermission === 'denied'
                    ? '기기 설정에서 이 사이트의 알림이 차단되어 있어요. 알림을 허용한 뒤 설정에서 다시 켜주세요.'
                    : '설정에서 알림을 켜면 새 방이 열릴 때 바로 알려드려요.'}
                </p>
                <div className="mt-2 flex gap-2">
                  {!installed ? (
                    <button
                      type="button"
                      onClick={() => setShowInstallSheet(true)}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary-600 px-3 text-xs font-extrabold text-white transition hover:bg-primary-700"
                    >
                      추가 방법 보기
                    </button>
                  ) : pushPermission !== 'denied' ? (
                    <button
                      type="button"
                      onClick={() => router.push('/settings')}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary-600 px-3 text-xs font-extrabold text-white transition hover:bg-primary-700"
                    >
                      알림 설정으로
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="settings-section" aria-labelledby="routes-subscribed-heading">
          {/* settings-section-heading-lg: 헤드라인 > 섹션 제목 > 본문 위계를 분명히 하기
              위해 이 화면의 섹션 제목만 한 단계 키운다(사용자 피드백). */}
          <div className="settings-section-heading settings-section-heading-lg">
            <h3 id="routes-subscribed-heading">구독한 경로</h3>
            {/* I-5: 토글은 푸시만 끄고 이 목록/앱 내 폴백은 계속 보인다(사용자 결정).
                라벨이 그냥 "알림"이면 "이 경로 안 볼래"로 읽히므로 무엇이 꺼지는지 알려야
                한다. 다만 구독이 0개일 때는 토글 자체가 화면에 없으므로, 있지도 않은
                컨트롤을 설명하는 문장이 먼저 나오면 순서가 뒤바뀐다 — 카드가 있을 때만
                설명한다. */}
            {routes.length > 0 && (
              <p>
                {/* 예전에는 "내 경로에 열린 방"이 별도 섹션이었다. 같은 정보를 두 곳에서
                    보여주는 게 비효율적이라는 피드백으로 각 카드의 뱃지로 합쳤다(Task 5). */}
                {openRoomsLoading
                  ? '토글은 푸시 알림만 켜고 꺼요 · 열린 방을 확인하는 중이에요'
                  : '토글은 푸시 알림만 켜고 꺼요 · 꺼도 이 목록과 열린 방은 계속 보여요'}
              </p>
            )}
          </div>

          {routes.length === 0 ? (
            /* 섹션 설명을 구독이 있을 때만 띄우므로, 비어 있을 때의 안내는 여기가 맡는다.
               큰 여백만 있는 빈 상자는 "없음"만 강조하니, 다음에 할 일을 한 줄 덧붙인다. */
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/70 px-4 py-6 text-center">
              <p className="text-sm font-bold text-gray-600">아직 구독한 경로가 없어요</p>
              <p className="mt-1 text-xs font-medium leading-relaxed text-gray-400">
                아래에서 자주 가는 경로를 추가하면
                <br />
                그 경로에 방이 열릴 때 알려드려요
              </p>
            </div>
          ) : (
            <div className="settings-list">
              {routes.map((route) => {
                const busy = busyRouteIds.has(route.id)
                const label = `${LOCATIONS[route.from_location]} → ${LOCATIONS[route.to_location]}`
                const roomsForRoute = openRoomsByRouteKey.get(routeKey(route.from_location, route.to_location)) ?? []
                const hasMultipleRooms = roomsForRoute.length > 1
                const expanded = hasMultipleRooms && expandedRouteIds.has(route.id)
                return (
                  // settings-row가 이 Fragment의 부모(settings-list)에 그대로 직속 자식으로
                  // 들어가야 .settings-row:first-child 구분선 규칙이 깨지지 않는다 — 감싸는
                  // div를 두면 매 행이 "자기 부모의 첫째 자식"이 되어 구분선이 전부 사라진다.
                  <Fragment key={route.id}>
                    <div className="settings-row items-center">
                      <div className="min-w-0 flex-1 py-0.5">
                        <p className="flex items-center gap-1 truncate text-[0.82rem] font-extrabold text-gray-950">
                          <span className="truncate">{LOCATIONS[route.from_location]}</span>
                          <ArrowRight className="h-3 w-3 shrink-0 text-gray-400" aria-hidden="true" />
                          <span className="truncate">{LOCATIONS[route.to_location]}</span>
                        </p>
                        <p className="mt-0.5 truncate text-[0.72rem] font-semibold text-gray-500">
                          {summarizeWindow(route.notify_from, route.notify_to)} · {summarizeWeekdays(route.notify_weekdays)}
                          {/* "알림 꺼짐"이라고만 하면 이 경로 전체를 안 본다는 뜻으로 읽힌다.
                              실제로는 푸시만 꺼지고 이 목록/앱 내 폴백은 계속 보이므로(I-5,
                              사용자 결정) 범위를 "푸시"로 명시한다. */}
                          {!route.notify_enabled && ' · 푸시 꺼짐'}
                        </p>
                        {roomsForRoute.length > 0 && (
                          // 색상만으로 정보를 주지 않도록(PRODUCT.md 접근성) 숫자를 텍스트로
                          // 함께 표기한다. 방이 1개면 고를 게 없어 바로 열고, 여러 개면
                          // 펼쳐서 출발 시각·인원을 보고 고르게 한다.
                          <button
                            type="button"
                            onClick={() => handleRouteRoomsBadgeClick(route, roomsForRoute)}
                            aria-expanded={hasMultipleRooms ? expanded : undefined}
                            aria-label={
                              hasMultipleRooms
                                ? `${label} 열린 방 ${roomsForRoute.length}개 ${expanded ? '목록 접기' : '목록 보기'}`
                                : `${label} 열린 방으로 이동`
                            }
                            className="mt-1.5 inline-flex min-h-6 items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[0.68rem] font-black text-primary-700 transition hover:bg-primary-100"
                          >
                            <Users className="h-3 w-3" aria-hidden="true" />
                            열린 방 {roomsForRoute.length}개
                          </button>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={route.notify_enabled}
                          aria-label={`${label} 푸시 알림 ${route.notify_enabled ? '끄기' : '켜기'}`}
                          onClick={() => handleToggleNotify(route)}
                          disabled={busy}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg disabled:opacity-50"
                        >
                          <span
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                              route.notify_enabled ? 'bg-primary-600' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                                route.notify_enabled ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`${label} 경로 삭제`}
                          onClick={() => handleDeleteRoute(route)}
                          disabled={busy}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="space-y-1.5 border-t border-gray-100 bg-gray-50/60 px-3 py-2">
                        {roomsForRoute.map((room) => (
                          <button
                            key={room.id}
                            type="button"
                            aria-label={`${LOCATIONS[room.from_location]}에서 ${LOCATIONS[room.to_location]} ${room.departure_date.slice(5).replace('-', '/')} ${room.departure_time.slice(0, 5)} 방 열기`}
                            onClick={() => handleOpenRoomClick(room)}
                            className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-100 bg-white px-2.5 py-2 text-left transition hover:border-primary-100 hover:bg-primary-50"
                          >
                            <span className="inline-flex items-center gap-1.5 text-[0.78rem] font-black text-gray-950">
                              <Clock className="h-3.5 w-3.5 text-primary-600" aria-hidden="true" />
                              {room.departure_date.slice(5).replace('-', '/')} {room.departure_time.slice(0, 5)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[0.7rem] font-black text-gray-500">
                              <Users className="h-3 w-3" aria-hidden="true" />
                              {room.participants?.length ?? 0}/{room.max_participants}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </Fragment>
                )
              })}
            </div>
          )}
        </section>

        <section className="settings-section" aria-labelledby="routes-add-heading">
          <div className="settings-section-heading settings-section-heading-lg">
            <h3 id="routes-add-heading">경로 추가</h3>
            <p>이미 구독 중인 경로를 다시 추가하면 시간대·요일 설정이 업데이트돼요</p>
          </div>

          {/* routes-form: 이 화면에서만 필드 라벨 위계를 낮추기 위한 스코프
              (app/globals.css 의 .routes-form .settings-field-label 참고). */}
          <div className="settings-field-stack routes-form">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="settings-field-label" htmlFor="routes-form-from">출발지</label>
                <select
                  id="routes-form-from"
                  value={formFrom}
                  onChange={(e) => handleFromChange(e.target.value as LocationType | '')}
                  className="input-field settings-input"
                >
                  <option value="">선택하세요</option>
                  {LOCATION_ENTRIES.map(([value, name]) => (
                    <option key={value} value={value}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="settings-field-label" htmlFor="routes-form-to">도착지</label>
                <select
                  id="routes-form-to"
                  value={formTo}
                  onChange={(e) => setFormTo(e.target.value as LocationType | '')}
                  className="input-field settings-input"
                >
                  <option value="">선택하세요</option>
                  {/* 선택 불가한 도착지(출발지 자신·근거리 제한 쌍)는 비활성 옵션으로 보여주지
                      않고 아예 렌더하지 않는다 — getDestinationOptions가 그 필터링을 맡는다. */}
                  {getDestinationOptions(formFrom).map((value) => (
                    <option key={value} value={value}>{LOCATIONS[value]}</option>
                  ))}
                </select>
              </div>
            </div>

            {(isSameLocationSelection || isRestrictedSelection) && (
              <div className="settings-error">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {isSameLocationSelection ? '출발지와 도착지가 같을 수 없어요' : ROUTE_TOO_CLOSE_MESSAGE}
              </div>
            )}

            <div>
              <p className="settings-field-label">알림 시간대</p>
              <div
                role="radiogroup"
                aria-label="알림 시간대"
                className="grid grid-cols-2 gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={formAllDay}
                  onClick={() => setFormAllDay(true)}
                  className={`min-h-10 rounded-md px-3 text-sm transition ${
                    formAllDay ? 'bg-white font-extrabold text-gray-950 shadow' : 'font-medium text-gray-500'
                  }`}
                >
                  종일
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!formAllDay}
                  onClick={() => setFormAllDay(false)}
                  className={`min-h-10 rounded-md px-3 text-sm transition ${
                    !formAllDay ? 'bg-white font-extrabold text-gray-950 shadow' : 'font-medium text-gray-500'
                  }`}
                >
                  직접 설정
                </button>
              </div>

              {!formAllDay && (
                // "시작"/"종료" 라벨 없이도 사이의 ~ 하나로 범위임이 바로 읽힌다(사용자 피드백).
                // 시각 라벨을 없애더라도 스크린리더에는 각 input의 aria-label로 계속 안내한다.
                <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                  <input
                    id="routes-form-time-from"
                    type="time"
                    aria-label="알림 시작 시각"
                    value={formWindow.from}
                    onChange={(e) => handleWindowChange('from', e.target.value)}
                    className="input-field settings-input"
                  />
                  <span aria-hidden="true" className="text-sm font-bold text-gray-400">~</span>
                  <input
                    id="routes-form-time-to"
                    type="time"
                    aria-label="알림 종료 시각"
                    value={formWindow.to}
                    onChange={(e) => handleWindowChange('to', e.target.value)}
                    className="input-field settings-input"
                  />
                </div>
              )}

              {isSameTimeSelection && (
                <div className="settings-error mt-1.5">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  시작 시각과 종료 시각을 다르게 설정해주세요
                </div>
              )}
            </div>

            <div>
              <p className="settings-field-label">알림 요일</p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_PRESET_OPTIONS.map(({ label, days }) => {
                  const active = weekdaysEqual(formWeekdays, days)
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={active}
                      onClick={() => handleWeekdayPreset(days)}
                      className={`min-h-10 rounded-lg border px-3 text-sm transition ${
                        active
                          ? 'border-primary-600 bg-primary-600 font-extrabold text-white'
                          : 'border-gray-200 bg-white font-medium text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              {/* 프리셋(매일/평일/주말)은 요약, 개별 요일은 세부다. 둘 다 solid 파랑이면
                  "매일" 선택 시 파란 블록이 8개가 되어 화면을 덮는다 — 개별 요일은 한 단계
                  낮춘 톤(연한 배경 + 진한 글자)으로 두어 프리셋이 요약으로 읽히게 한다.
                  색 외에 글자 굵기·테두리·aria-pressed 로도 상태를 구분한다(PRODUCT.md). */}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {WEEKDAY_LABELS.map((label, day) => {
                  const active = formWeekdays.includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={active}
                      aria-label={`${label}요일 ${active ? '알림 끄기' : '알림 켜기'}`}
                      onClick={() => toggleWeekday(day)}
                      className={`flex h-10 w-10 items-center justify-center rounded-lg border text-sm transition ${
                        active
                          ? 'border-primary-200 bg-primary-50 font-extrabold text-primary-700'
                          : 'border-gray-200 bg-white font-medium text-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              {formWeekdays.length === 0 && (
                <div className="settings-error mt-1.5">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  요일을 하나 이상 선택하세요
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleSubmitForm}
              disabled={!canSubmitForm}
              className="btn-primary settings-save-button w-full"
            >
              {formSubmitting ? (
                <span className="inline-flex items-center justify-center">
                  <span className="loading-spinner mr-2 h-4 w-4" />
                  추가 중
                </span>
              ) : (
                <>
                  <Plus className="mr-1.5 h-4 w-4" />
                  경로 추가
                </>
              )}
            </button>
          </div>
        </section>
      </main>

      {showInstallSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/30 px-3 pb-3 pt-16 sm:items-center sm:pb-16"
          onClick={() => setShowInstallSheet(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="routes-install-sheet-title"
            className="mx-auto w-full max-w-sm rounded-lg border border-white/80 bg-white p-4 shadow-[0_18px_48px_rgba(17,24,39,0.24)]"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.02em] text-primary-600">알림 받기</p>
                <h2 id="routes-install-sheet-title" className="mt-1 text-base font-black leading-tight tracking-tight text-gray-950">
                  홈 화면에 추가하고 알림을 받으세요
                </h2>
              </div>
              <button
                type="button"
                aria-label="홈 화면 추가 안내 닫기"
                onClick={() => setShowInstallSheet(false)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-950"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-primary-100 bg-primary-50 px-3 py-2.5">
                <BellRing className="h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
                <p className="text-xs font-bold text-gray-700">
                  구독한 경로에 방이 열리면 <span className="font-black text-gray-950">푸시 알림</span>을 받을 수 있어요
                </p>
              </div>
              <div className="flex gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
                <p className="text-xs font-bold leading-5 text-gray-700">
                  iPhone에서는 브라우저의 공유
                  <Share2 className="mx-1 inline h-3.5 w-3.5 align-[-2px] text-primary-600" aria-hidden="true" />
                  버튼을 누른 뒤 홈 화면에 추가를 선택하세요.
                </p>
              </div>
              <div className="flex gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <Star className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
                <p className="text-xs font-bold leading-5 text-gray-700">
                  Android에서는 브라우저 메뉴에서 홈 화면에 추가 또는 앱 설치를 선택하면 됩니다.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowInstallSheet(false)}
                className="h-11 w-full rounded-lg bg-gray-950 text-sm font-black text-white transition hover:bg-gray-800"
              >
                확인했어요
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
