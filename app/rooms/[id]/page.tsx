'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Fragment, type CSSProperties, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react'
import Image from 'next/image'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ChatRoom, User, Message, RoomParticipant, PayoutAccount, LOCATIONS } from '@/lib/supabase'
import {
  extractHostAppearanceFromMessage,
  splitMessages,
  upsertMessage,
  prependOlderMessages,
  HOST_APPEARANCE_MESSAGE_PREFIX,
  LEGACY_HOST_APPEARANCE_MESSAGE_PREFIX,
  type MessageAuthor,
} from '@/lib/chat/messages'
import { formatAccountNumberForBank } from '@/lib/banks'
import { identifyAnalyticsUser, trackEvent } from '@/lib/analytics/client'
import { ArrowLeft, Users, Clock, Send, Flag, X, LogOut, Phone, CreditCard, Copy } from 'lucide-react'
import { format, isSameDay } from 'date-fns'
import { ko } from 'date-fns/locale'
import toast from 'react-hot-toast'

const MAX_TIMESTAMP_REVEAL = 68
const MESSAGE_PAGE_SIZE = 50

type RoomPrivateInfoPayload = {
  phonesByUserId?: Record<string, string | null>
  creatorPayoutAccount?: PayoutAccount | null
  error?: string
}

export default function ChatRoomPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.id as string

  const [user, setUser] = useState<User | null>(null)
  const [room, setRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false)
  const [participants, setParticipants] = useState<RoomParticipant[]>([])
  const [creatorPayoutAccount, setCreatorPayoutAccount] = useState<PayoutAccount | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [isConfirmingParticipation, setIsConfirmingParticipation] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showParticipants, setShowParticipants] = useState(false)
  const [showCallConsentModal, setShowCallConsentModal] = useState(false)
  const [selectedCallParticipant, setSelectedCallParticipant] = useState<RoomParticipant | null>(null)
  const [hostAppearance, setHostAppearance] = useState('')
  const [hostAppearanceLoaded, setHostAppearanceLoaded] = useState(false)
  const [hostAppearanceDraft, setHostAppearanceDraft] = useState('')
  const [showRoomGuide, setShowRoomGuide] = useState(false)
  const [isSubmittingHostGuide, setIsSubmittingHostGuide] = useState(false)
  const [showHostLeaveModal, setShowHostLeaveModal] = useState(false)
  const [hostLeaveAgreed, setHostLeaveAgreed] = useState(false)
  const [nextHostId, setNextHostId] = useState('')
  const [reportReason, setReportReason] = useState('')
  const [reportTarget, setReportTarget] = useState<string>('')
  const [timestampReveal, setTimestampReveal] = useState(0)
  const roomGuideStorageKey = useMemo(
    () => `gatita:room-entry-guide:${roomId}:${user?.id ?? 'anonymous'}`,
    [roomId, user?.id]
  )

  const headerRef = useRef<HTMLElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const composerInputRef = useRef<HTMLInputElement>(null)
  const composerSendButtonRef = useRef<HTMLButtonElement>(null)
  const hostAppearanceInputRef = useRef<HTMLInputElement>(null)
  const isComposerFocusedRef = useRef(false)
  const isHostAppearanceFocusedRef = useRef(false)
  const visualViewportBaselineRef = useRef(0)
  const timestampDragRef = useRef({
    isTracking: false,
    startX: 0,
    startY: 0,
  })
  const supabase = useMemo(() => createClient(), [])
  const roomSyncChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const trackedRoomOpenRef = useRef<string | null>(null)
  const preloadedParticipantAvatarUrlsRef = useRef(new Set<string>())
  const authorsCacheRef = useRef(new Map<string, MessageAuthor>())
  const oldestRawCreatedAtRef = useRef<string | null>(null)
  const lastMessageIdRef = useRef<string | null>(null)
  const pendingScrollRestoreRef = useRef<number | null>(null)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const scroller = messagesScrollRef.current

    if (scroller) {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior })
      return
    }

    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' })
  }, [])

  const keepWindowPinned = useCallback(() => {
    if (window.scrollY !== 0) {
      window.scrollTo(0, 0)
    }
  }, [])

  const pinLatestMessageIfScrollable = useCallback(() => {
    const scroller = messagesScrollRef.current
    if (!scroller) return

    const hasScrollableMessages = scroller.scrollHeight > scroller.clientHeight + 1
    if (!hasScrollableMessages) return

    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'auto' })
  }, [])

  const syncChatChrome = useCallback(() => {
    const root = document.documentElement
    const visualViewport = window.visualViewport
    const viewportHeight = visualViewport?.height ?? window.innerHeight

    const isKeyboardInputFocused = isComposerFocusedRef.current || isHostAppearanceFocusedRef.current

    if (
      !isKeyboardInputFocused
      || visualViewportBaselineRef.current === 0
      || viewportHeight > visualViewportBaselineRef.current
    ) {
      visualViewportBaselineRef.current = viewportHeight
    }

    const keyboardInset = isKeyboardInputFocused
      ? Math.max(0, visualViewportBaselineRef.current - viewportHeight)
      : 0
    const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0
    const composerHeight = composerRef.current?.getBoundingClientRect().height ?? 0

    root.style.setProperty('--chat-header-height', `${Math.ceil(headerHeight)}px`)
    root.style.setProperty('--chat-composer-height', `${Math.ceil(composerHeight)}px`)
    root.style.setProperty('--chat-keyboard-inset', `${Math.ceil(keyboardInset)}px`)
    root.style.setProperty('--chat-viewport-height', `${Math.ceil(viewportHeight)}px`)
  }, [])

  const syncAndPinChat = useCallback(() => {
    syncChatChrome()
    requestAnimationFrame(keepWindowPinned)
  }, [keepWindowPinned, syncChatChrome])

  const scrollHostAppearanceInputIntoView = useCallback(() => {
    isHostAppearanceFocusedRef.current = true

    const revealInput = () => {
      syncAndPinChat()
      hostAppearanceInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    revealInput()
    requestAnimationFrame(revealInput)
    window.setTimeout(revealInput, 120)
    window.setTimeout(revealInput, 320)
  }, [syncAndPinChat])

  const handleHostAppearanceBlur = useCallback(() => {
    isHostAppearanceFocusedRef.current = false
    syncAndPinChat()
    window.setTimeout(syncAndPinChat, 80)
  }, [syncAndPinChat])

  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    const previousRootOverflow = root.style.overflow
    const previousRootPosition = root.style.position
    const previousRootInset = root.style.inset
    const previousRootWidth = root.style.width
    const previousRootHeight = root.style.height
    const previousBodyOverflow = body.style.overflow
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior
    const previousBodyPosition = body.style.position
    const previousBodyInset = body.style.inset
    const previousBodyWidth = body.style.width
    const previousBodyHeight = body.style.height
    const previousChatHeaderHeight = root.style.getPropertyValue('--chat-header-height')
    const previousChatComposerHeight = root.style.getPropertyValue('--chat-composer-height')
    const previousChatKeyboardInset = root.style.getPropertyValue('--chat-keyboard-inset')
    const previousChatViewportHeight = root.style.getPropertyValue('--chat-viewport-height')

    const restoreProperty = (property: string, value: string) => {
      if (value) {
        root.style.setProperty(property, value)
      } else {
        root.style.removeProperty(property)
      }
    }

    root.style.overflow = 'hidden'
    root.style.position = 'fixed'
    root.style.inset = '0'
    root.style.width = '100%'
    root.style.height = '100%'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    body.style.position = 'fixed'
    body.style.inset = '0'
    body.style.width = '100%'
    body.style.height = '100%'
    syncAndPinChat()

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncAndPinChat)
      : null

    if (headerRef.current) resizeObserver?.observe(headerRef.current)
    if (composerRef.current) resizeObserver?.observe(composerRef.current)

    window.visualViewport?.addEventListener('resize', syncAndPinChat)
    window.addEventListener('resize', syncAndPinChat)
    window.addEventListener('orientationchange', syncAndPinChat)
    window.addEventListener('scroll', keepWindowPinned, { passive: true })

    return () => {
      root.style.overflow = previousRootOverflow
      root.style.position = previousRootPosition
      root.style.inset = previousRootInset
      root.style.width = previousRootWidth
      root.style.height = previousRootHeight
      body.style.overflow = previousBodyOverflow
      body.style.overscrollBehavior = previousBodyOverscrollBehavior
      body.style.position = previousBodyPosition
      body.style.inset = previousBodyInset
      body.style.width = previousBodyWidth
      body.style.height = previousBodyHeight
      restoreProperty('--chat-header-height', previousChatHeaderHeight)
      restoreProperty('--chat-composer-height', previousChatComposerHeight)
      restoreProperty('--chat-keyboard-inset', previousChatKeyboardInset)
      restoreProperty('--chat-viewport-height', previousChatViewportHeight)
      resizeObserver?.disconnect()
      window.visualViewport?.removeEventListener('resize', syncAndPinChat)
      window.removeEventListener('resize', syncAndPinChat)
      window.removeEventListener('orientationchange', syncAndPinChat)
      window.removeEventListener('scroll', keepWindowPinned)
    }
  }, [keepWindowPinned, syncAndPinChat])

  useLayoutEffect(() => {
    const scroller = messagesScrollRef.current

    // 이전 메시지 prepend 시: 스크롤 위치 보존 (맨 아래로 튀지 않게)
    if (pendingScrollRestoreRef.current !== null) {
      if (scroller) {
        scroller.scrollTop += scroller.scrollHeight - pendingScrollRestoreRef.current
      }
      pendingScrollRestoreRef.current = null
      lastMessageIdRef.current = messages.length ? messages[messages.length - 1].id : null
      return
    }

    // 새 메시지(맨 아래) 추가/초기 로드일 때만 하단으로 스크롤
    const lastId = messages.length ? messages[messages.length - 1].id : null
    if (lastId !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastId
      scrollToBottom()
    }
  }, [messages, scrollToBottom])

  useLayoutEffect(() => {
    if (loading || !room || !user) return

    const syncInitialChatViewport = () => {
      syncAndPinChat()
      scrollToBottom('auto')
    }

    syncInitialChatViewport()
    const frameId = window.requestAnimationFrame(syncInitialChatViewport)
    const timeoutId = window.setTimeout(syncInitialChatViewport, 80)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(timeoutId)
    }
  }, [loading, room, scrollToBottom, syncAndPinChat, user])

  const handleComposerFocus = useCallback(() => {
    isComposerFocusedRef.current = true

    const syncKeyboardViewport = () => {
      syncAndPinChat()
      pinLatestMessageIfScrollable()
    }

    syncKeyboardViewport()
    requestAnimationFrame(syncKeyboardViewport)
    window.setTimeout(syncKeyboardViewport, 80)
    window.setTimeout(syncKeyboardViewport, 160)
    window.setTimeout(syncKeyboardViewport, 240)
  }, [pinLatestMessageIfScrollable, syncAndPinChat])

  const handleComposerBlur = useCallback(() => {
    isComposerFocusedRef.current = false
    syncAndPinChat()
    window.setTimeout(syncAndPinChat, 80)
  }, [syncAndPinChat])

  const handleComposerInputPointerDown = useCallback((event: ReactPointerEvent<HTMLInputElement>) => {
    if (event.pointerType !== 'touch') return

    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
  }, [])

  const handleMessagesPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return

    timestampDragRef.current = {
      isTracking: true,
      startX: event.clientX,
      startY: event.clientY,
    }
  }, [])

  const handleMessagesPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = timestampDragRef.current
    if (!drag.isTracking) return

    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY

    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      setTimestampReveal(0)
      return
    }

    setTimestampReveal(Math.min(MAX_TIMESTAMP_REVEAL, Math.max(0, -deltaX)))
  }, [])

  const handleMessagesPointerEnd = useCallback(() => {
    timestampDragRef.current.isTracking = false
    setTimestampReveal(0)
  }, [])

  const timestampRevealStyle = useMemo(() => ({
    '--timestamp-reveal': `${timestampReveal}px`,
    '--timestamp-opacity': `${Math.min(1, timestampReveal / MAX_TIMESTAMP_REVEAL)}`,
  }) as CSSProperties, [timestampReveal])
  const isRoomCreator = room?.created_by === user?.id
  const isParticipant = participants.some(p => p.user_id === user?.id)
  const formattedCreatorAccountNumber = useMemo(() => (
    creatorPayoutAccount
      ? formatAccountNumberForBank(creatorPayoutAccount.bank_name, creatorPayoutAccount.account_number)
      : ''
  ), [creatorPayoutAccount])
  const hostTransferCandidates = useMemo(
    () => participants.filter((participant) => participant.user_id !== user?.id),
    [participants, user?.id]
  )

  const loadRoom = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('chat_rooms')
        .select(`
          *,
          creator:created_by(nickname, department)
        `)
        .eq('id', roomId)
        .single()

      if (data) {
        setRoom(data as any)
      } else {
        router.push('/')
      }
    } catch (error) {
      console.error('Load room error:', error)
      router.push('/')
    }
  }, [roomId, router, supabase])

  // 캐시에 없는 작성자만 조회해 채운다 (메시지마다 전체 작성자 재조회 방지).
  const ensureAuthors = useCallback(async (userIds: string[]) => {
    const missing = Array.from(new Set(userIds)).filter((id) => id && !authorsCacheRef.current.has(id))
    if (missing.length === 0) return

    const { data: authors, error } = await supabase
      .from('users')
      .select('id, nickname, department, avatar_url')
      .in('id', missing)

    if (error) {
      console.error('Load message authors error:', error)
      return
    }

    authors?.forEach((author) => {
      authorsCacheRef.current.set(author.id, author as MessageAuthor)
    })
  }, [supabase])

  const loadMessages = useCallback(async () => {
    try {
      const [messagesResult, hostResult] = await Promise.all([
        // 전체가 아니라 최근 MESSAGE_PAGE_SIZE개만 (내림차순으로 받아 오름차순으로 뒤집음)
        supabase
          .from('messages')
          .select('id, room_id, user_id, content, created_at')
          .eq('room_id', roomId)
          .order('created_at', { ascending: false })
          .limit(MESSAGE_PAGE_SIZE),
        // 방장 인상착의는 페이지 창(최근 N개) 밖의 과거 메시지일 수 있어 최신 1건을 따로 조회
        supabase
          .from('messages')
          .select('content')
          .eq('room_id', roomId)
          .or(`content.like.${HOST_APPEARANCE_MESSAGE_PREFIX}*,content.like.${LEGACY_HOST_APPEARANCE_MESSAGE_PREFIX}*`)
          .order('created_at', { ascending: false })
          .limit(1),
      ])

      if (messagesResult.error) throw messagesResult.error

      const rawDesc = (messagesResult.data ?? []) as Message[]
      setHasMoreMessages(rawDesc.length === MESSAGE_PAGE_SIZE)
      const raw = rawDesc.slice().reverse()
      oldestRawCreatedAtRef.current = raw[0]?.created_at ?? null

      const { visible, latestHostAppearance } = splitMessages(raw)

      const hostContent = hostResult.data?.[0]?.content as string | undefined
      const resolvedHostAppearance = (hostContent ? extractHostAppearanceFromMessage(hostContent) : '') || latestHostAppearance
      if (resolvedHostAppearance) {
        setHostAppearance(resolvedHostAppearance)
      }
      setHostAppearanceLoaded(true)

      await ensureAuthors(visible.map((message) => message.user_id))

      setMessages(visible.map((message) => ({
        ...message,
        user: authorsCacheRef.current.get(message.user_id),
      })) as Message[])
    } catch (error) {
      console.error('Load messages error:', error)
      setHostAppearanceLoaded(true)
    }
  }, [ensureAuthors, roomId, supabase])

  // 페이지네이션: 현재 가장 오래된 메시지보다 이전 메시지 한 페이지를 앞에 붙인다.
  const loadOlderMessages = useCallback(async () => {
    const cursor = oldestRawCreatedAtRef.current
    if (!cursor || isLoadingOlderMessages) return

    setIsLoadingOlderMessages(true)
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id, room_id, user_id, content, created_at')
        .eq('room_id', roomId)
        .lt('created_at', cursor)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE)

      if (error) throw error

      const rawDesc = (data ?? []) as Message[]
      setHasMoreMessages(rawDesc.length === MESSAGE_PAGE_SIZE)
      if (rawDesc.length === 0) return

      const raw = rawDesc.slice().reverse()
      oldestRawCreatedAtRef.current = raw[0]?.created_at ?? cursor

      const { visible } = splitMessages(raw)
      await ensureAuthors(visible.map((message) => message.user_id))

      const scroller = messagesScrollRef.current
      if (scroller) {
        pendingScrollRestoreRef.current = scroller.scrollHeight
      }

      setMessages((prev) => prependOlderMessages(prev, visible.map((message) => ({
        ...message,
        user: authorsCacheRef.current.get(message.user_id),
      })) as Message[]))
    } catch (error) {
      console.error('Load older messages error:', error)
      toast.error('이전 메시지를 불러오지 못했습니다')
    } finally {
      setIsLoadingOlderMessages(false)
    }
  }, [ensureAuthors, isLoadingOlderMessages, roomId, supabase])

  // 실시간으로 도착한 단일 메시지를 전체 재조회 없이 증분 반영한다.
  const applyIncomingMessage = useCallback(async (incoming: Message) => {
    const appearance = extractHostAppearanceFromMessage(incoming.content)
    if (appearance) {
      setHostAppearance(appearance)
      return
    }

    await ensureAuthors([incoming.user_id])

    setMessages((prev) => upsertMessage(prev, {
      ...incoming,
      user: authorsCacheRef.current.get(incoming.user_id),
    } as Message))
  }, [ensureAuthors])

  const loadParticipants = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('room_participants')
        .select(`
          *,
          user:users(nickname, department, avatar_url)
        `)
        .eq('room_id', roomId)

      if (data) {
        const privateResponse = await fetch(`/api/rooms/${roomId}/private`)
        const privateResult = await privateResponse.json().catch(() => null) as RoomPrivateInfoPayload | null
        const phonesByUserId = privateResponse.ok ? privateResult?.phonesByUserId ?? {} : {}

        if (privateResponse.ok) {
          setCreatorPayoutAccount(privateResult?.creatorPayoutAccount ?? null)
        } else {
          setCreatorPayoutAccount(null)
        }

        setParticipants(data.map((participant: any) => ({
          ...participant,
          user: participant.user
            ? {
                ...participant.user,
                phone: phonesByUserId[participant.user_id] ?? null,
              }
            : participant.user,
        })) as any)
      }
    } catch (error) {
      console.error('Load participants error:', error)
    }
  }, [roomId, supabase])

  const checkParticipation = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('room_participants')
        .select('confirmed')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .maybeSingle()

      if (data) {
        setIsConfirmed(data.confirmed)
      } else {
        setIsConfirmed(false)
      }
    } catch (error) {
      // 참여자가 아닌 경우
    }
  }, [roomId, supabase])

  const markRoomRead = useCallback(() => {
    // Fire-and-forget; keepalive lets it survive navigation away from the room.
    fetch(`/api/rooms/${roomId}/read`, { method: 'POST', keepalive: true }).catch(() => {})
  }, [roomId])

  const checkAuthAndLoadData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const authUser = session?.user

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

      const userData = profileResult?.user

      if (!profileResult?.profileCompleted || !userData) {
        router.push('/')
        return
      }

      setUser(userData)
      identifyAnalyticsUser(userData.id, {
        profile_completed: true,
        is_admin: userData.is_admin,
        account_status: userData.status,
        department: userData.department,
      })
      await Promise.all([
        loadRoom(),
        loadMessages(),
        loadParticipants(),
        checkParticipation(userData.id)
      ])
      markRoomRead()
    } catch (error) {
      console.error('Auth/data loading error:', error)
      router.push('/')
    } finally {
      setLoading(false)
    }
  }, [checkParticipation, loadMessages, loadParticipants, loadRoom, markRoomRead, router, supabase])

  useEffect(() => {
    if (!roomId) {
      router.push('/')
      return
    }

    checkAuthAndLoadData()
  }, [checkAuthAndLoadData, roomId, router])

  // Mark read on leaving so messages seen during the visit clear the map badge.
  useEffect(() => () => markRoomRead(), [markRoomRead])

  const handleParticipantsRefresh = useCallback(async () => {
    await Promise.all([
      loadParticipants(),
      user ? checkParticipation(user.id) : Promise.resolve(),
    ])
  }, [checkParticipation, loadParticipants, user])

  const broadcastRoomSync = useCallback(async (reason: 'participants') => {
    const channel = roomSyncChannelRef.current
    if (!channel) return

    try {
      await channel.send({
        type: 'broadcast',
        event: 'room-sync',
        payload: {
          reason,
          roomId,
        },
      })
    } catch (error) {
      console.error('Broadcast room sync error:', error)
    }
  }, [roomId])

  useEffect(() => {
    if (!room) return

    const syncChannel = supabase
      .channel(`room-sync:${roomId}`)
      .on('broadcast', { event: 'room-sync' }, handleParticipantsRefresh)
      .subscribe()

    roomSyncChannelRef.current = syncChannel

    const messagesChannel = supabase
      .channel(`messages:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          void applyIncomingMessage(payload.new as Message)
        }
      )
      .subscribe()

    const participantsChannel = supabase
      .channel(`participants:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_participants',
          filter: `room_id=eq.${roomId}`,
        },
        handleParticipantsRefresh
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'room_participants',
        },
        handleParticipantsRefresh
      )
      .subscribe()

    return () => {
      if (roomSyncChannelRef.current === syncChannel) {
        roomSyncChannelRef.current = null
      }
      supabase.removeChannel(syncChannel)
      supabase.removeChannel(messagesChannel)
      supabase.removeChannel(participantsChannel)
    }
  }, [applyIncomingMessage, handleParticipantsRefresh, room, roomId, supabase])

  useEffect(() => {
    if (loading || !room || !user) return
    const trackingKey = `${roomId}:${user.id}`
    if (trackedRoomOpenRef.current === trackingKey) return

    trackedRoomOpenRef.current = trackingKey

    trackEvent('chat_room_opened', {
      room_id: roomId,
      from_location: room.from_location,
      to_location: room.to_location,
      departure_date: room.departure_date,
      departure_time: room.departure_time,
      is_creator: room.created_by === user.id,
      is_participant: isParticipant,
    })
  }, [isParticipant, loading, room, roomId, user])

  useEffect(() => {
    if (loading || !room || !user) return
    if (!isParticipant) return
    if (room.created_by === user.id) return
    if (window.localStorage.getItem(roomGuideStorageKey)) return

    setShowRoomGuide(true)
  }, [isParticipant, loading, room, roomGuideStorageKey, user])

  useEffect(() => {
    if (!showHostLeaveModal) return
    if (nextHostId) return

    setNextHostId(hostTransferCandidates[0]?.user_id ?? '')
  }, [hostTransferCandidates, nextHostId, showHostLeaveModal])

  useEffect(() => {
    if (typeof window === 'undefined') return

    participants.forEach((participant) => {
      const avatarUrl = participant.user?.avatar_url
      if (!avatarUrl || preloadedParticipantAvatarUrlsRef.current.has(avatarUrl)) return

      preloadedParticipantAvatarUrlsRef.current.add(avatarUrl)
      const image = new window.Image()
      image.decoding = 'async'
      image.src = avatarUrl
    })
  }, [participants])

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() || !user) return

    // 내 작성자 정보를 캐시에 보장 (실시간 echo·이후 메시지에서 재사용)
    authorsCacheRef.current.set(user.id, {
      id: user.id,
      nickname: user.nickname,
      department: user.department,
      avatar_url: user.avatar_url ?? null,
    })

    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      content: newMessage.trim(),
      user_id: user.id,
      room_id: roomId,
      created_at: new Date().toISOString(),
      user: authorsCacheRef.current.get(user.id) as User,
    }

    // 즉시 UI에 메시지 추가 (낙관적 업데이트)
    setMessages((prev) => [...prev, tempMessage])
    setNewMessage('')

    try {
      const { data: inserted, error } = await supabase
        .from('messages')
        .insert({
          room_id: roomId,
          user_id: user.id,
          content: tempMessage.content,
        })
        .select('id, room_id, user_id, content, created_at')
        .single()

      if (error) throw error

      // 실제 저장된 행으로 임시 메시지를 교체 (전체 재조회 없이). 실시간 echo는 같은 id라 멱등.
      if (inserted) {
        setMessages((prev) => upsertMessage(prev, {
          ...(inserted as Message),
          user: authorsCacheRef.current.get(user.id),
        } as Message))
      }

      trackEvent('chat_message_sent', {
        room_id: roomId,
        message_length: tempMessage.content.length,
        is_creator: isRoomCreator,
      })
    } catch (error) {
      // 오류 시 임시 메시지 제거하고 입력창에 다시 표시
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id))
      setNewMessage(tempMessage.content)
      console.error('Send message error:', error)
      toast.error('메시지 전송 중 오류가 발생했습니다')
    }
  }, [isRoomCreator, newMessage, roomId, supabase, user])

  // 전송 후에도 메시지를 계속 입력할 수 있도록 입력창 포커스를 유지(키패드 닫힘 방지)
  const focusComposerInput = useCallback(() => {
    composerInputRef.current?.focus({ preventScroll: true })
  }, [])

  const handleSendButtonPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'touch') return

    // 터치 전송: 입력창 포커스(=키패드)를 유지한 채 즉시 전송
    event.preventDefault()
    void handleSendMessage()
    focusComposerInput()
  }, [focusComposerInput, handleSendMessage])

  // 데스크톱 마우스: 버튼이 입력창 포커스를 빼앗지 않도록 mousedown 기본 동작 차단
  const handleSendButtonMouseDown = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
  }, [])

  const handleSendButtonClick = useCallback(() => {
    void handleSendMessage()
    // 데스크톱 클릭·폴백 경로에서도 입력창 포커스를 유지한다
    focusComposerInput()
  }, [focusComposerInput, handleSendMessage])

  // iOS Safari/PWA에서는 화면을 탭하면 포커스가 입력창 밖으로 빠져 키패드가 닫힌다.
  // 이를 막으려면 전송 버튼의 touchstart 기본 동작을 차단해야 하는데, React 합성
  // 이벤트는 passive라 preventDefault가 무시되므로 네이티브 비-passive 리스너로 등록한다.
  // (키패드 밖 영역을 터치해 닫는 동작은 입력창 onBlur에서 그대로 유지된다.)
  useEffect(() => {
    const button = composerSendButtonRef.current
    if (!button) return

    const preventComposerBlur = (event: TouchEvent) => {
      event.preventDefault()
    }

    button.addEventListener('touchstart', preventComposerBlur, { passive: false })
    return () => button.removeEventListener('touchstart', preventComposerBlur)
  }, [isParticipant])

  const handleConfirmParticipation = async () => {
    if (!user || isConfirmed || isConfirmingParticipation) return

    setIsConfirmingParticipation(true)

    try {
      const response = await fetch(`/api/rooms/${roomId}/confirm`, {
        method: 'POST',
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error ?? '참여 확정 중 오류가 발생했습니다')
      }

      setIsConfirmed(true)
      await loadParticipants()
      await broadcastRoomSync('participants')
      trackEvent('participant_confirmed', {
        room_id: roomId,
        is_creator: isRoomCreator,
      })
      toast.success('참여 확정되었습니다', { id: 'confirm-participation' })
    } catch (error) {
      console.error('Confirm participation error:', error)
      toast.error('참여 확정 중 오류가 발생했습니다')
    } finally {
      setIsConfirmingParticipation(false)
    }
  }

  const completeLeaveRoom = async (transferHostId?: string) => {
    if (!user) return

    try {
      const response = await fetch(`/api/rooms/${roomId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextHostId: transferHostId ?? null }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error ?? '채팅방 나가기 중 오류가 발생했습니다')
      }

      toast.success('채팅방을 나갔습니다')
      await broadcastRoomSync('participants')
      trackEvent('room_left', {
        room_id: roomId,
        was_creator: isRoomCreator,
        transferred_host: Boolean(transferHostId),
      })
      router.push('/map')
    } catch (error) {
      console.error('Leave room error:', error)
      toast.error(error instanceof Error ? error.message : '채팅방 나가기 중 오류가 발생했습니다')
    }
  }

  const handleLeaveRoom = async () => {
    if (!user || !room) return

    if (isRoomCreator && participants.length >= 2) {
      setHostLeaveAgreed(false)
      setNextHostId(hostTransferCandidates[0]?.user_id ?? '')
      setShowHostLeaveModal(true)
      return
    }

    if (!window.confirm('정말로 채팅방을 나가시겠습니까?')) return

    await completeLeaveRoom()
  }

  const handleConfirmHostLeave = async () => {
    if (!hostLeaveAgreed) {
      toast.error('멤버들과 협의가 완료됐는지 확인해주세요')
      return
    }

    if (!nextHostId) {
      toast.error('다음 방장을 선택해주세요')
      return
    }

    setShowHostLeaveModal(false)
    await completeLeaveRoom(nextHostId)
  }

  const handleReport = async () => {
    if (!reportReason.trim() || !reportTarget || !user) return

    try {
      const { error } = await supabase
        .from('reports')
        .insert({
          room_id: roomId,
          reporter_id: user.id,
          reported_id: reportTarget,
          reason: reportReason.trim()
        })

      if (error) throw error

      setShowReportModal(false)
      setReportReason('')
      setReportTarget('')
      trackEvent('report_submitted', {
        room_id: roomId,
      })
      toast.success('신고가 접수되었습니다')
    } catch (error) {
      console.error('Report error:', error)
      toast.error('신고 접수 중 오류가 발생했습니다')
    }
  }

  const copyCreatorPayoutAccount = useCallback(async () => {
    if (!creatorPayoutAccount) return

    const accountText = [
      creatorPayoutAccount.bank_name,
      formattedCreatorAccountNumber,
      creatorPayoutAccount.account_holder,
    ].filter(Boolean).join(' ')

    try {
      await navigator.clipboard.writeText(accountText)
      trackEvent('payout_account_copied', {
        room_id: roomId,
      })
      toast.success('계좌 정보를 복사했습니다')
    } catch (error) {
      console.error('Copy creator payout account error:', error)
      toast.error('계좌 정보를 복사하지 못했습니다')
    }
  }, [creatorPayoutAccount, formattedCreatorAccountNumber, roomId])

  const handleCallParticipant = useCallback((participant: RoomParticipant) => {
    if (!participant.user?.phone) {
      toast.error('전화번호가 등록되지 않았습니다')
      return
    }

    setSelectedCallParticipant(participant)
    setShowCallConsentModal(true)
    trackEvent('participant_call_started', {
      room_id: roomId,
      has_phone: true,
    })
  }, [roomId])

  const closeCallConsentModal = useCallback(() => {
    setShowCallConsentModal(false)
    setSelectedCallParticipant(null)
  }, [])

  const confirmCallParticipant = useCallback(() => {
    const phone = selectedCallParticipant?.user?.phone

    if (!phone) {
      toast.error('전화번호가 등록되지 않았습니다')
      closeCallConsentModal()
      return
    }

    closeCallConsentModal()
    window.location.href = `tel:${phone}`
  }, [closeCallConsentModal, selectedCallParticipant])

  const closeRoomGuide = useCallback(() => {
    window.localStorage.setItem(roomGuideStorageKey, 'true')
    setShowRoomGuide(false)
  }, [roomGuideStorageKey])

  const handleSubmitHostGuide = async () => {
    if (!user) return
    if (!hostAppearanceDraft.trim()) {
      toast.error('인상착의를 한 줄로 작성해주세요')
      return
    }

    setIsSubmittingHostGuide(true)

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          room_id: roomId,
          user_id: user.id,
          content: `${HOST_APPEARANCE_MESSAGE_PREFIX}${hostAppearanceDraft.trim()}`,
        })

      if (error) throw error

      setHostAppearance(hostAppearanceDraft.trim())
      setHostAppearanceDraft('')
      trackEvent('host_guide_saved', {
        room_id: roomId,
        appearance_length: hostAppearanceDraft.trim().length,
      })
      toast.success('인상착의가 저장되었습니다')
    } catch (error) {
      console.error('Save host appearance error:', error)
      toast.error('인상착의 저장 중 오류가 발생했습니다')
    } finally {
      setIsSubmittingHostGuide(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (!room || !user) {
    return null
  }

  return (
    <div className="chat-shell fixed inset-0 w-screen max-w-full overflow-hidden overscroll-none app-bg">
      {/* Header */}
      <header ref={headerRef} className="chat-room-header fixed inset-x-0 z-30 overflow-hidden px-3 pb-2">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="flex min-w-0 items-start">
            <button
              aria-label="지도로 돌아가기"
              onClick={() => router.push('/map')}
              className="mr-2 shrink-0 rounded-lg p-2 hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-gray-900">
                {LOCATIONS[room.from_location]} → {LOCATIONS[room.to_location]}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                <Clock className="w-4 h-4 mr-1" />
                <span>{format(new Date(`${room.departure_date}T${room.departure_time}`), 'M월 d일 HH:mm', { locale: ko })}</span>
                <span className="inline-flex items-center">
                  <Users className="mr-1 h-4 w-4" />
                  {participants.length}/{room.max_participants}
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {isParticipant && (
              <button
                type="button"
                aria-label="참여자 보기"
                onClick={() => setShowParticipants(true)}
                className="relative rounded-lg p-2 text-gray-700 hover:bg-gray-100"
              >
                <Users className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              aria-label="신고하기"
              onClick={() => setShowReportModal(true)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <Flag className="w-5 h-5 text-gray-600" />
            </button>
            {isParticipant && (
              <button
                type="button"
                aria-label="채팅방 나가기"
                onClick={handleLeaveRoom}
                className="rounded-lg p-2 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <LogOut className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* 방장 계좌 */}
        <div className="mt-2 rounded-xl border border-primary-100 bg-primary-50/90 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary-700">
              <CreditCard className="h-3.5 w-3.5" />
              <span>방장 계좌</span>
            </div>
            {creatorPayoutAccount && (
              <button
                type="button"
                onClick={copyCreatorPayoutAccount}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-white px-2 text-[11px] font-black text-primary-700 shadow-sm ring-1 ring-primary-100 transition hover:bg-primary-50"
              >
                <Copy className="h-3.5 w-3.5" />
                복사
              </button>
            )}
          </div>
          {creatorPayoutAccount ? (
            <p className="chat-payout-account mt-1 truncate text-xs font-semibold text-gray-900">
              {creatorPayoutAccount.bank_name} {formattedCreatorAccountNumber} {creatorPayoutAccount.account_holder}
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">
              방장 계좌 정보가 아직 등록되지 않았습니다.
            </p>
          )}
        </div>

        {/* 참여 확정 버튼 */}
        {isParticipant && !isConfirmed && (
          <div className="mt-2">
            <button
              onClick={handleConfirmParticipation}
              disabled={isConfirmingParticipation}
              className="btn-primary w-full py-2 text-sm"
            >
              {isConfirmingParticipation ? '확정 중...' : '참여 확정하기'}
            </button>
          </div>
        )}
      </header>

      {/* 채팅 메시지 영역 */}
      <div
        ref={messagesScrollRef}
        className="chat-messages absolute left-0 right-0 top-0 space-y-2 overflow-y-auto overflow-x-hidden px-3"
        style={timestampRevealStyle}
        onPointerDown={handleMessagesPointerDown}
        onPointerMove={handleMessagesPointerMove}
        onPointerUp={handleMessagesPointerEnd}
        onPointerCancel={handleMessagesPointerEnd}
        onPointerLeave={handleMessagesPointerEnd}
      >
        {hasMoreMessages && (
          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={loadOlderMessages}
              disabled={isLoadingOlderMessages}
              className="rounded-full bg-gray-100 px-4 py-1.5 text-xs text-gray-600 transition active:scale-95 disabled:opacity-50"
            >
              {isLoadingOlderMessages ? '불러오는 중…' : '이전 메시지 더보기'}
            </button>
          </div>
        )}
        {messages.map((message, index) => {
          const isOwnMessage = message.user_id === user.id
          const previousMessage = messages[index - 1]
          const nextMessage = messages[index + 1]
          const messageDate = new Date(message.created_at)
          // 이전 메시지와 날짜가 다르면(또는 첫 메시지면) 카카오톡처럼 날짜 구분선을 먼저 그린다
          const showDateDivider = !previousMessage || !isSameDay(new Date(previousMessage.created_at), messageDate)
          const nextStartsNewDay = !!nextMessage && !isSameDay(messageDate, new Date(nextMessage.created_at))
          const startsMessageGroup = showDateDivider || !previousMessage || previousMessage.user_id !== message.user_id
          const endsMessageGroup = nextStartsNewDay || !nextMessage || nextMessage.user_id !== message.user_id

          return (
            <Fragment key={message.id}>
              {showDateDivider && (
                <div className="chat-date-divider" role="separator">
                  <span>{format(messageDate, 'yyyy년 M월 d일 EEEE', { locale: ko })}</span>
                </div>
              )}
              <div
                className={`chat-message-row flex w-full min-w-0 ${startsMessageGroup ? 'is-new-author' : 'is-same-author'} ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`chat-message-bubble-stack min-w-0 max-w-[min(78vw,18rem)] ${isOwnMessage ? 'ml-7' : 'mr-7'}`}>
                  {!isOwnMessage && startsMessageGroup && (
                    <p className="chat-message-author">
                      {message.user?.nickname} ({message.user?.department})
                    </p>
                  )}
                  <div
                    className={`chat-message max-w-full ${
                      isOwnMessage ? 'chat-message-own' : 'chat-message-other'
                    } ${startsMessageGroup ? 'chat-message-group-start' : 'chat-message-group-follow'} ${endsMessageGroup ? 'chat-message-group-end' : 'chat-message-group-continue'}`}
                  >
                    {message.content}
                  </div>
                </div>
                <time className="chat-message-time" dateTime={message.created_at}>
                  {format(messageDate, 'HH:mm')}
                </time>
              </div>
            </Fragment>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 방장 안내: 차단형 모달 대신 대화 시작 전까지 빈 채팅 배경으로 표시 */}
      {isRoomCreator && (
        <div
          className={`chat-host-watermark${messages.length > 0 ? ' is-gone' : ''}`}
          aria-hidden={messages.length > 0}
        >
          <div className="chat-host-watermark__panel">
            <p className="chat-host-watermark__kicker">방장 안내</p>
            <h2 className="chat-host-watermark__title">출발 전 체크</h2>
            <ul className="chat-host-watermark__list">
              <li>
                <span aria-hidden="true">💳</span>
                <p>정산이 필요하면 방장이 결제 후 정산해요. 채팅방 상단에 방장 계좌가 표시돼요.</p>
              </li>
              <li>
                <span aria-hidden="true">🤝</span>
                <p>출발 5분 전부터 갑자기 방을 나가면 서비스 이용이 정지될 수 있어요.</p>
              </li>
              <li>
                <span aria-hidden="true">📞</span>
                <p>멤버들과 전화번호가 노출될 수 있어요. 동행 목적에만 사용해주세요.</p>
              </li>
            </ul>

            {hostAppearanceLoaded && (
              hostAppearance ? (
                <p className="chat-host-watermark__saved">
                  <span aria-hidden="true">🧍</span> 인상착의 저장됨 · {hostAppearance}
                </p>
              ) : (
                <div className="chat-host-watermark__appearance">
                  <label htmlFor="host-appearance" className="chat-host-watermark__appearance-label">
                    <span aria-hidden="true">🧍</span> 인상착의 한 줄 <em>(선택)</em>
                  </label>
                  <div className="chat-host-watermark__appearance-row">
                    <input
                      ref={hostAppearanceInputRef}
                      id="host-appearance"
                      type="text"
                      value={hostAppearanceDraft}
                      onChange={(event) => setHostAppearanceDraft(event.target.value)}
                      onFocus={scrollHostAppearanceInputIntoView}
                      onBlur={handleHostAppearanceBlur}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && hostAppearanceDraft.trim()) {
                          event.preventDefault()
                          handleSubmitHostGuide()
                        }
                      }}
                      placeholder="예: 검은 백팩, 파란 후드"
                      maxLength={60}
                      className="chat-host-watermark__input"
                    />
                    <button
                      type="button"
                      onClick={handleSubmitHostGuide}
                      disabled={!hostAppearanceDraft.trim() || isSubmittingHostGuide}
                      className="chat-host-watermark__submit"
                    >
                      {isSubmittingHostGuide ? '저장 중' : '남기기'}
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* 메시지 입력 영역 */}
      <div ref={composerRef} className="chat-composer fixed inset-x-0 z-30 border-t border-gray-100 bg-white px-3 pt-3">
        {isParticipant ? (
          <div className="flex min-w-0 items-center gap-2">
            <input
              ref={composerInputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              onPointerDown={handleComposerInputPointerDown}
              onFocus={handleComposerFocus}
              onBlur={handleComposerBlur}
              placeholder="메시지를 입력하세요..."
              className="min-w-0 flex-1 rounded-full border border-gray-200 px-4 py-2 text-base focus:border-primary-600 focus:ring-2 focus:ring-primary-100"
            />
            <button
              ref={composerSendButtonRef}
              type="button"
              onClick={handleSendButtonClick}
              onPointerDown={handleSendButtonPointerDown}
              onMouseDown={handleSendButtonMouseDown}
              disabled={!newMessage.trim()}
              className="shrink-0 rounded-full bg-primary-600 p-2 text-white hover:bg-primary-700 disabled:bg-gray-300"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <p className="text-gray-600 text-sm">
            채팅방에 참여해야 메시지를 보낼 수 있습니다
          </p>
        )}
      </div>

      {/* 참여자 시트 */}
      {showParticipants && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-gray-950/35 px-3 pb-3 pt-16"
          onClick={() => setShowParticipants(false)}
        >
          <div
            className="w-full rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-gray-950">참여자</h2>
                <p className="text-xs text-gray-500">{participants.length}/{room.max_participants}명 참여 중</p>
              </div>
              <button
                type="button"
                aria-label="참여자 목록 닫기"
                onClick={() => setShowParticipants(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[42vh] space-y-2 overflow-y-auto">
              {participants.map(participant => {
                const isCurrentUserParticipant = participant.user_id === user?.id

                return (
                  <div
                    key={participant.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${
                      isCurrentUserParticipant
                        ? 'border-primary-100 bg-primary-50'
                        : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-sm font-black text-primary-700 ring-1 ring-gray-100">
                        {participant.user?.avatar_url ? (
                          <Image
                            src={participant.user.avatar_url}
                            alt=""
                            width={40}
                            height={40}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span>{(participant.user?.nickname ?? '나').slice(0, 1)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className="truncate text-sm font-bold text-gray-950">
                            {isCurrentUserParticipant ? `(나) ${participant.user?.nickname ?? '나'}` : participant.user?.nickname}
                          </p>
                          {participant.user_id === room.created_by && (
                            <span className="shrink-0 rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold text-primary-700">
                              방장
                            </span>
                          )}
                          {participant.user_id !== room.created_by && participant.confirmed && (
                            <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">확정</span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-gray-500">{participant.user?.department}</p>
                        {participant.user_id === room.created_by && hostAppearance && (
                          <p className="mt-1 max-w-[13rem] rounded-lg bg-white px-2 py-1 text-[11px] font-bold leading-4 text-gray-600">
                            🧍 {hostAppearance}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCallParticipant(participant)}
                      aria-label={`${participant.user?.nickname ?? '참여자'}에게 전화하기`}
                      disabled={!participant.user?.phone}
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        participant.user?.phone
                          ? 'bg-primary-600 text-white hover:bg-primary-700'
                          : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      <Phone className="h-5 w-5" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 방장 최초 안내 모달 */}
      {/* 입장 안내 모달 */}
      {showRoomGuide && (
        <div className="fixed inset-0 z-50 flex items-end bg-gray-950/35 px-3 pb-3 pt-16">
          <div className="chat-guide-sheet w-full rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-gray-200" />
            <div className="mb-4">
              <p className="text-xs font-black text-primary-600">입장 안내</p>
              <h2 className="mt-1 text-xl font-black leading-tight text-gray-950">동행 전 체크</h2>
            </div>

            {hostAppearance && (
              <div className="mb-3 rounded-xl border border-primary-100 bg-primary-50 px-3 py-3">
                <p className="text-xs font-black text-primary-700">🧍 방장 인상착의</p>
                <p className="mt-1 text-base font-black leading-6 text-gray-950">{hostAppearance}</p>
              </div>
            )}

            <div className="chat-guide-card">
              <div className="chat-guide-line">
                <span className="chat-guide-icon">✅</span>
                <p>동행할 거라면 상단의 참여 확정하기를 꼭 눌러주세요.</p>
              </div>
              <div className="chat-guide-line">
                <span className="chat-guide-icon">🧭</span>
                <p>꼭 도착지까지 가지 않아도 참여할 수 있어요.<br /> 중간에 헤어질 예정이면 채팅에서 먼저 알려주세요.</p>
              </div>
              <div className="chat-guide-line">
                <span className="chat-guide-icon">⏰</span>
                <p>출발 5분 전부터는 갑자기 방을 나가면 서비스 이용이 정지될 수 있어요.</p>
              </div>
              <div className="chat-guide-line">
                <span className="chat-guide-icon">📞</span>
                <p>
                  방장과 멤버들은 서로 전화번호가 노출될 수 있어요.<br /> 지각, 노쇼, 출발 위치 확인 등 동행 목적에만 사용해주세요.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={closeRoomGuide}
              className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-xl bg-gray-950 text-sm font-black text-white transition hover:bg-gray-800"
            >
              확인했어요
            </button>
          </div>
        </div>
      )}

      {/* 전화 걸기 확인 모달 */}
      {showCallConsentModal && selectedCallParticipant && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-gray-950/35 px-3 pb-3 pt-16"
          onClick={closeCallConsentModal}
        >
          <div
            className="w-full rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
                  <Phone className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.08em] text-primary-600">전화 연결</p>
                  <h2 className="mt-1 truncate text-lg font-extrabold text-gray-950">
                    {selectedCallParticipant.user?.nickname ?? '참여자'}에게 전화
                  </h2>
                </div>
              </div>
              <button
                type="button"
                aria-label="전화 연결 취소"
                onClick={closeCallConsentModal}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-sm font-bold leading-5 text-gray-700">
              전화번호가 그대로 전달될 수 있어요. 지각, 노쇼, 출발 위치 확인 등 동행 목적에만 사용해주세요.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeCallConsentModal}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-sm font-black text-gray-700 transition hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmCallParticipant}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 text-sm font-black text-white transition hover:bg-primary-700"
              >
                전화 걸기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 방장 나가기 확인 모달 */}
      {showHostLeaveModal && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-gray-950/35 px-3 pb-3 pt-16"
          onClick={() => setShowHostLeaveModal(false)}
        >
          <div
            className="w-full rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.08em] text-red-600">방장 나가기</p>
                <h2 className="mt-1 text-lg font-extrabold text-gray-950">다음 방장을 정해주세요</h2>
              </div>
              <button
                type="button"
                aria-label="방장 나가기 닫기"
                onClick={() => setShowHostLeaveModal(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm font-bold text-gray-700">
              <input
                type="checkbox"
                checked={hostLeaveAgreed}
                onChange={(event) => setHostLeaveAgreed(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600"
              />
              <span>멤버들과 협의가 완료됐나요?</span>
            </label>

            <div className="mt-3">
              <label className="mb-1.5 block text-xs font-black text-gray-700">다음 방장</label>
              <select
                value={nextHostId}
                onChange={(event) => setNextHostId(event.target.value)}
                className="input-field text-base font-bold"
              >
                <option value="">선택해주세요</option>
                {hostTransferCandidates.map((participant) => (
                  <option key={participant.user_id} value={participant.user_id}>
                    {participant.user?.nickname} ({participant.user?.department})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleConfirmHostLeave}
              disabled={!hostLeaveAgreed || !nextHostId}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-red-600 text-sm font-black text-white transition hover:bg-red-700 disabled:bg-gray-300"
            >
              나가기
            </button>
            <p className="mt-2 text-center text-[11px] font-semibold leading-4 text-gray-400">
              협의 없이 여러 번 탈주하면 서비스 이용이 정지될 수 있습니다
            </p>
          </div>
        </div>
      )}

      {/* 신고 모달 */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">신고하기</h3>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    신고 대상
                  </label>
                  <select
                    value={reportTarget}
                    onChange={(e) => setReportTarget(e.target.value)}
                    className="input-field"
                  >
                    <option value="">선택해주세요</option>
                    {participants
                      .filter(p => p.user_id !== user.id)
                      .map(participant => (
                        <option key={participant.user_id} value={participant.user_id}>
                          {participant.user?.nickname} ({participant.user?.department})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    신고 사유
                  </label>
                  <textarea
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    placeholder="신고 사유를 자세히 작성해주세요"
                    rows={4}
                    className="input-field resize-none"
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => setShowReportModal(false)}
                  className="btn-secondary flex-1"
                >
                  취소
                </button>
                <button
                  onClick={handleReport}
                  disabled={!reportReason.trim() || !reportTarget}
                  className="btn-primary flex-1"
                >
                  신고하기
                </button>
              </div>

              <p className="text-xs text-gray-500 mt-3 text-center">
                신고 사유 검토 후 이용정지 등의 제재가 있을 수 있습니다
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
