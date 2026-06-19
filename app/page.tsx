'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  ChatRoom,
  getDepartureDateForTime,
  LOCATIONS,
  LocationType,
  ROUTE_TOO_CLOSE_MESSAGE,
  User,
  isRoomJoinable,
  isRoomVisibleOnMap,
  isRestrictedRoutePair,
} from '@/lib/supabase'
import { usePresenceDisplayCount } from '@/lib/usePresenceDisplayCount'
import { GACHON_ACCOUNT_HINT, NON_GACHON_ACCOUNT_MESSAGE, getGoogleOAuthOptions, isGachonEmail } from '@/lib/auth'
import { isInstalled } from '@/lib/pwa'
import { ArrowRight, Clock, MessageSquareText, Share2, Star, Settings, LogOut, Users, X } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

import CampusRouteMap, { CampusMapRoom } from '@/components/CampusRouteMap'
import SignupForm from '@/components/auth/SignupForm'
import Grainient from '@/components/Grainient'
import SplitText from '@/components/SplitText'
import NavigationBar from '@/components/NavigationBar'

type AuthMode = 'signup' | null

type MyRoomSummary = CampusMapRoom & {
  departure_date: string
}

const PWA_ONBOARDING_STORAGE_KEY = 'gatita:pwa-onboarding-dismissed'

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

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState<AuthMode>(null)
  const [fromLocation, setFromLocation] = useState<LocationType | ''>('')
  const [mapRooms, setMapRooms] = useState<CampusMapRoom[]>([])
  const [myRooms, setMyRooms] = useState<MyRoomSummary[]>([])
  const [isLoadingMapRooms, setIsLoadingMapRooms] = useState(false)
  const [isLoadingMyRooms, setIsLoadingMyRooms] = useState(false)
  const [showMyRooms, setShowMyRooms] = useState(false)
  const [isCreatingMapRoom, setIsCreatingMapRoom] = useState(false)
  const [isStartingGoogle, setIsStartingGoogle] = useState(false)
  const [hasEnteredApp, setHasEnteredApp] = useState(false)
  const [showPwaOnboarding, setShowPwaOnboarding] = useState(false)
  const [showStandaloneSplash, setShowStandaloneSplash] = useState(false)
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [showTestLogin, setShowTestLogin] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testPassword, setTestPassword] = useState('')
  const [isStartingTestLogin, setIsStartingTestLogin] = useState(false)
  const lastAuthErrorAtRef = useRef(0)
  const mapHeaderRef = useRef<HTMLElement>(null)
  const router = useRouter()

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

    if (now - lastAuthErrorAtRef.current > 1500) {
      toast.error(message)
      lastAuthErrorAtRef.current = now
    }
  }, [])

  const rejectNonGachonAccount = useCallback(async () => {
    showAuthError(NON_GACHON_ACCOUNT_MESSAGE)
    setUser(null)
    setAuthMode(null)
    setHasEnteredApp(false)

    if (supabase) {
      await supabase.auth.signOut()
    }
  }, [showAuthError, supabase])

  const loadMapRooms = useCallback(async () => {
    if (!supabase) {
      return
    }

    setIsLoadingMapRooms(true)

    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data } = await supabase
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
        .eq('departure_date', today)
        .eq('status', 'active')
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
      })))
    } catch (error) {
      console.error('Load my rooms error:', error)
      toast.error('나의 방을 불러오지 못했습니다')
    } finally {
      setIsLoadingMyRooms(false)
    }
  }, [supabase, user])

  const checkAuth = useCallback(async (enterApp = false) => {
    if (!supabase) {
      setLoading(false)
      return
    }

    try {
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

      if (session?.user) {
        const email = session.user.email
        if (!isGachonEmail(email)) {
          await rejectNonGachonAccount()
          return
        }

        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()

        if (userData) {
          setAuthNotice(null)
          setUser(userData)
          await loadMapRooms()
          if (enterApp) setHasEnteredApp(true)
        } else {
          setAuthMode('signup')
        }
      } else if (window.location.pathname === '/map') {
        router.replace('/')
      }
    } catch (error) {
      console.error('Auth check error:', error)
    } finally {
      setLoading(false)
    }
  }, [loadMapRooms, rejectNonGachonAccount, router, supabase])

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
        setAuthMode(null)
        setHasEnteredApp(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [checkAuth, supabase])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setShowTestLogin(params.get('test-login') === '1')
  }, [])

  useEffect(() => {
    if (!isInstalled()) return

    setShowStandaloneSplash(true)
    const timerId = window.setTimeout(() => {
      setShowStandaloneSplash(false)
    }, 900)

    return () => window.clearTimeout(timerId)
  }, [])

  useEffect(() => {
    if (!user || !hasEnteredApp) return

    loadMapRooms()
    const intervalId = window.setInterval(loadMapRooms, 30000)

    return () => window.clearInterval(intervalId)
  }, [hasEnteredApp, loadMapRooms, user])

  const onlineDisplayCount = usePresenceDisplayCount(
    supabase,
    user && hasEnteredApp ? 'presence:gachon-map' : null,
    user
  )

  const showLanding = !loading && authMode !== 'signup' && (!user || !hasEnteredApp)

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
    if (!user || !hasEnteredApp) return

    const root = document.documentElement
    const body = document.body
    const previousAppViewportHeight = root.style.getPropertyValue('--app-viewport-height')
    const previousMapHeaderBottom = root.style.getPropertyValue('--map-header-bottom')
    const previousRootOverflow = root.style.overflow
    const previousBodyOverflow = body.style.overflow
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior
    const standaloneDisplayQuery = window.matchMedia('(display-mode: standalone)')

    const setAppViewport = () => {
      const visualHeight = window.visualViewport?.height ?? window.innerHeight
      const headerBottom = mapHeaderRef.current?.getBoundingClientRect().bottom

      root.style.setProperty('--app-viewport-height', `${Math.ceil(visualHeight)}px`)
      if (typeof headerBottom === 'number' && headerBottom > 0) {
        root.style.setProperty('--map-header-bottom', `${Math.ceil(headerBottom)}px`)
      }
    }
    const applyMapDisplayMode = () => {
      const isStandaloneMap = isInstalled()

      root.classList.toggle('gatita-standalone-map', isStandaloneMap)
      root.classList.toggle('gatita-browser-map', !isStandaloneMap)
    }

    setAppViewport()
    applyMapDisplayMode()
    window.scrollTo(0, 0)
    root.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'

    const headerResizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(setAppViewport)
      : null
    if (mapHeaderRef.current) headerResizeObserver?.observe(mapHeaderRef.current)

    window.addEventListener('resize', setAppViewport)
    window.addEventListener('orientationchange', setAppViewport)
    window.visualViewport?.addEventListener('resize', setAppViewport)
    window.visualViewport?.addEventListener('scroll', setAppViewport)
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
      window.removeEventListener('resize', setAppViewport)
      window.removeEventListener('orientationchange', setAppViewport)
      window.visualViewport?.removeEventListener('resize', setAppViewport)
      window.visualViewport?.removeEventListener('scroll', setAppViewport)
      if (typeof standaloneDisplayQuery.removeEventListener === 'function') {
        standaloneDisplayQuery.removeEventListener('change', applyMapDisplayMode)
      } else {
        standaloneDisplayQuery.removeListener(applyMapDisplayMode)
      }
    }
  }, [hasEnteredApp, user])

  useEffect(() => {
    if (!user || !hasEnteredApp) return
    if (isInstalled()) return
    if (window.localStorage.getItem(PWA_ONBOARDING_STORAGE_KEY)) return

    const timerId = window.setTimeout(() => {
      setShowPwaOnboarding(true)
    }, 600)

    return () => window.clearTimeout(timerId)
  }, [hasEnteredApp, user])

  const validateRouteSelection = (from: LocationType | '', to: LocationType | '') => {
    if (!from || !to) {
      toast.error('출발지와 도착지를 모두 선택해주세요')
      return false
    }

    if (from === to) {
      toast.error('출발지와 도착지가 같을 수 없습니다')
      return false
    }

    if (isRestrictedRoutePair(from, to)) {
      toast.error(ROUTE_TOO_CLOSE_MESSAGE)
      return false
    }

    return true
  }

  const handleFromLocationChange = (location: LocationType | '') => {
    setFromLocation(location)
  }

  const handleCreateMapRoom = async ({
    fromLocation: roomFromLocation,
    toLocation: roomToLocation,
    departureTime,
  }: {
    fromLocation: LocationType
    toLocation: LocationType
    departureTime: string
  }) => {
    if (!user || !supabase) {
      toast.error('로그인이 필요합니다')
      return
    }

    if (!validateRouteSelection(roomFromLocation, roomToLocation)) return

    if (!departureTime) {
      toast.error('출발예정시간을 선택해주세요')
      return
    }

    setIsCreatingMapRoom(true)

    try {
      const departureDate = getDepartureDateForTime(new Date(), departureTime)
      const title = `${departureTime} ${LOCATIONS[roomFromLocation]}→${LOCATIONS[roomToLocation]}`

      const { data: room, error } = await supabase
        .from('chat_rooms')
        .insert({
          title,
          from_location: roomFromLocation,
          to_location: roomToLocation,
          departure_date: departureDate,
          departure_time: departureTime,
          max_participants: 4,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) throw error

      const { error: participantError } = await supabase
        .from('room_participants')
        .insert({
          room_id: room.id,
          user_id: user.id,
          confirmed: true,
        })

      if (participantError) {
        await supabase
          .from('chat_rooms')
          .delete()
          .eq('id', room.id)
          .eq('created_by', user.id)

        throw participantError
      }

      toast.success('채팅방이 생성되었습니다!')
      router.push(`/rooms/${room.id}`)
    } catch (error) {
      console.error('Create map room error:', error)
      toast.error('채팅방 생성 중 오류가 발생했습니다')
    } finally {
      setIsCreatingMapRoom(false)
    }
  }

  const handleJoinMapRoom = async (roomId: string) => {
    if (!user || !supabase) return

    try {
      const room = mapRooms.find((mapRoom) => mapRoom.id === roomId)
      if (!room) return

      if (!isRoomJoinable(room.departure_date, room.departure_time)) {
        toast.error('이미 지난 출발 시간입니다')
        return
      }

      if (room.participants?.some((participant) => participant.user_id === user.id)) {
        router.push(`/rooms/${roomId}`)
        return
      }

      const { count, error: countError } = await supabase
        .from('room_participants')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId)

      if (countError) throw countError

      if ((count ?? room.participants?.length ?? 0) >= room.max_participants) {
        toast.error('채팅방이 가득 찼습니다')
        return
      }

      const { error } = await supabase
        .from('room_participants')
        .insert({
          room_id: roomId,
          user_id: user.id,
          confirmed: false,
        })

      if (error) {
        if (error.code === '23505') {
          router.push(`/rooms/${roomId}`)
          return
        }

        throw error
      }

      router.push(`/rooms/${roomId}`)
    } catch (error) {
      console.error('Join map room error:', error)
      toast.error('채팅방 참여 중 오류가 발생했습니다')
    }
  }

  const handleLogout = async () => {
    if (!supabase) return

    try {
      await supabase.auth.signOut()
      setUser(null)
      router.push('/')
      toast.success('로그아웃되었습니다')
    } catch (error) {
      toast.error('로그아웃 중 오류가 발생했습니다')
    }
  }

  const handleGoogleStart = async () => {
    if (!supabase) {
      toast.error('인증 설정을 불러오지 못했습니다')
      return
    }

    setAuthNotice(null)
    setIsStartingGoogle(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: getGoogleOAuthOptions(),
      })
      if (error) throw error
    } catch (error) {
      console.error('Google login error:', error)
      toast.error('구글 로그인 중 오류가 발생했습니다')
      setIsStartingGoogle(false)
    }
  }

  const handleTestLogin = async () => {
    if (!supabase) {
      toast.error('인증 설정을 불러오지 못했습니다')
      return
    }

    if (!testEmail.trim() || !testPassword) {
      toast.error('테스트 계정 정보를 입력해주세요')
      return
    }

    setIsStartingTestLogin(true)
    setAuthNotice(null)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: testEmail.trim(),
        password: testPassword,
      })

      if (error) throw error

      const email = data.user?.email
      if (!isGachonEmail(email)) {
        await rejectNonGachonAccount()
        return
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single()

      if (userError || !userData) {
        await supabase.auth.signOut()
        throw userError || new Error('테스트 프로필을 찾지 못했습니다')
      }

      setUser(userData)
      setAuthMode(null)
      setHasEnteredApp(true)
      router.push('/map')
      toast.success('테스트 계정으로 로그인했습니다')
    } catch (error) {
      console.error('Test login error:', error)
      toast.error('테스트 로그인에 실패했습니다')
    } finally {
      setIsStartingTestLogin(false)
    }
  }

  const handleEnterApp = () => {
    setHasEnteredApp(true)
    router.push('/map')
  }

  const handleOpenMyRooms = () => {
    setShowMyRooms(true)
    loadMyRooms()
  }

  const dismissPwaOnboarding = useCallback(() => {
    window.localStorage.setItem(PWA_ONBOARDING_STORAGE_KEY, 'true')
    setShowPwaOnboarding(false)
  }, [])

  const handleFindClick = () => {
    toast.error('먼저 로그인하셔야 합니다.');
  };

  const standaloneLaunchSplash = showStandaloneSplash ? (
    <div className="gatita-pwa-launch-splash fixed inset-0 z-[120] flex flex-col items-center justify-center bg-[#f9fcff]">
      <Image
        src="/brand/gatita-logo.png"
        alt=""
        width={128}
        height={128}
        priority
        className="h-28 w-28 object-contain drop-shadow-[0_16px_36px_rgba(31,78,200,0.18)]"
      />
      <div className="mt-5 text-5xl font-black leading-none tracking-[0] text-gray-950">
        같이타
      </div>
    </div>
  ) : null

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
        <p className="text-gray-900 text-lg">로딩 중...</p>
        <p className="text-gray-500 text-sm mt-2">잠시만 기다려주세요</p>
        {standaloneLaunchSplash}
      </div>
    )
  }

  if (authMode === 'signup') {
    return (
      <>
        <SignupForm
          onSuccess={() => {
            setAuthMode(null)
            router.push('/map')
            checkAuth(true)
          }}
          onBackToLanding={() => setAuthMode(null)}
        />
        {standaloneLaunchSplash}
      </>
    )
  }

  if (!user || !hasEnteredApp) {
    return (
      <main className="landing-page">
        {standaloneLaunchSplash}
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

          <NavigationBar onFindClick={user ? handleEnterApp : handleFindClick} />

          <div className="landing-hero">
            <SplitText
              text="같이 탈래요?"
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
              가천대 학생들을 위한 통학길 동행 플랫폼
            </p>

            <div style={{
              display: 'flex',
              position: 'relative',
              width: '100%',
              maxWidth: '320px',
              marginTop: user ? '1rem' : '6rem',
            }}>
              {!user && (
                <span id="gachon-account-hint" className="cta-bubble">
                  {GACHON_ACCOUNT_HINT}
                </span>
              )}
              <button
                onClick={user ? handleEnterApp : handleGoogleStart}
                disabled={!user && isStartingGoogle}
                aria-describedby={!user ? 'gachon-account-hint' : undefined}
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
                  cursor: (!user && isStartingGoogle) ? 'not-allowed' : 'pointer',
                  transition: 'transform 0.2s, opacity 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.625rem',
                  opacity: (!user && isStartingGoogle) ? 0.7 : 1,
                }}
                onMouseOver={e => {
                  if (!(!user && isStartingGoogle)) e.currentTarget.style.transform = 'scale(1.03)'
                }}
                onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                {!user && <GoogleIcon />}
                {user ? '바로 시작하기' : (isStartingGoogle ? 'Google로 이동 중...' : 'Google로 3초 안에 시작하기')}
              </button>
            </div>

            {authNotice && !user && (
              <div role="alert" className="auth-notice">
                {authNotice}
              </div>
            )}

            {showTestLogin && !user && (
              <form
                className="mt-5 w-full max-w-[320px] rounded-lg border border-white/55 bg-white/90 p-3 shadow-[0_12px_30px_rgba(17,24,39,0.16)] backdrop-blur"
                onSubmit={(event) => {
                  event.preventDefault()
                  handleTestLogin()
                }}
              >
                <p className="mb-2 text-xs font-black text-gray-700">검수용 로그인</p>
                <div className="space-y-2">
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(event) => setTestEmail(event.target.value)}
                    placeholder="아이디"
                    autoComplete="username"
                    className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500"
                  />
                  <input
                    type="password"
                    value={testPassword}
                    onChange={(event) => setTestPassword(event.target.value)}
                    placeholder="비밀번호"
                    autoComplete="current-password"
                    className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500"
                  />
                  <button
                    type="submit"
                    disabled={isStartingTestLogin}
                    className="h-10 w-full rounded-lg bg-gray-950 text-sm font-black text-white transition hover:bg-gray-800 disabled:bg-gray-300"
                  >
                    {isStartingTestLogin ? '로그인 중...' : '테스트 계정으로 로그인'}
                  </button>
                </div>
              </form>
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
      </main>
    )
  }

  return (
    <main
      className="relative w-screen overflow-hidden bg-[#e7edf4]"
      style={{ height: 'var(--app-viewport-height)' }}
    >
      {standaloneLaunchSplash}
      <CampusRouteMap
        rooms={mapRooms}
        onlineCount={onlineDisplayCount}
        selectedFrom={fromLocation}
        isCreatingRoom={isCreatingMapRoom}
        isLoading={isLoadingMapRooms}
        onSelectFrom={handleFromLocationChange}
        onCreateRoom={handleCreateMapRoom}
        onJoinRoom={handleJoinMapRoom}
      />

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

      {showPwaOnboarding && (
        <div
          className="absolute inset-0 z-[60] flex items-end bg-gray-950/30 px-3 pb-3 pt-20"
          onClick={dismissPwaOnboarding}
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
                <p className="text-xs font-black tracking-[0.02em] text-primary-600">홈 화면 추가</p>
                <h2 id="pwa-onboarding-title" className="mt-1 text-lg font-black text-gray-950">
                  홈 화면에 추가해서 앱처럼 쓰세요
                </h2>
              </div>
            </div>

            <div className="mt-4 space-y-2">
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

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={dismissPwaOnboarding}
                className="h-11 flex-1 rounded-lg border border-gray-200 bg-white text-sm font-black text-gray-700 transition hover:bg-gray-50"
              >
                나중에
              </button>
              <button
                type="button"
                onClick={dismissPwaOnboarding}
                className="h-11 flex-1 rounded-lg bg-gray-950 text-sm font-black text-white transition hover:bg-gray-800"
              >
                지금 할게요
              </button>
            </div>
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
              <p className="truncate text-xs font-semibold text-gray-600">{user.nickname}님, 안녕하세요!</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="나의 방"
              onClick={handleOpenMyRooms}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 hover:text-gray-950"
            >
              <MessageSquareText className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="설정"
              onClick={() => router.push('/settings')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 hover:text-gray-950"
            >
              <Settings className="h-5 w-5" />
            </button>
            {user.is_admin && (
              <button
                type="button"
                aria-label="관리자 페이지"
                onClick={() => router.push('/admin')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600 transition hover:bg-red-100"
              >
                <Star className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              aria-label="로그아웃"
              onClick={handleLogout}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 hover:text-gray-950"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>
    </main>
  )
}
