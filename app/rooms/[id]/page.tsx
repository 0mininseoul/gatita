'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ChatRoom, User, Message, RoomParticipant, PayoutAccount, LOCATIONS } from '@/lib/supabase'
import { ArrowLeft, Users, Clock, Send, Flag, Check, X, LogOut, Phone, CreditCard, Copy } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import toast from 'react-hot-toast'

const MAX_TIMESTAMP_REVEAL = 68
const HOST_APPEARANCE_MESSAGE_PREFIX = '__gatita_host_appearance__:'
const LEGACY_HOST_APPEARANCE_MESSAGE_PREFIX = '방장 인상착의:'

function extractHostAppearanceFromMessage(content: string) {
  if (content.startsWith(HOST_APPEARANCE_MESSAGE_PREFIX)) {
    return content.slice(HOST_APPEARANCE_MESSAGE_PREFIX.length).trim()
  }

  if (content.startsWith(LEGACY_HOST_APPEARANCE_MESSAGE_PREFIX)) {
    return content.slice(LEGACY_HOST_APPEARANCE_MESSAGE_PREFIX.length).trim()
  }

  return ''
}

export default function ChatRoomPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.id as string

  const [user, setUser] = useState<User | null>(null)
  const [room, setRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [participants, setParticipants] = useState<RoomParticipant[]>([])
  const [creatorPayoutAccount, setCreatorPayoutAccount] = useState<PayoutAccount | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showParticipants, setShowParticipants] = useState(false)
  const [showCallConsentModal, setShowCallConsentModal] = useState(false)
  const [selectedCallParticipant, setSelectedCallParticipant] = useState<RoomParticipant | null>(null)
  const [showHostGuide, setShowHostGuide] = useState(false)
  const [hostAppearance, setHostAppearance] = useState('')
  const [hostAppearanceDraft, setHostAppearanceDraft] = useState('')
  const [showRoomGuide, setShowRoomGuide] = useState(false)
  const [isSubmittingHostGuide, setIsSubmittingHostGuide] = useState(false)
  const [showHostLeaveModal, setShowHostLeaveModal] = useState(false)
  const [hostLeaveAgreed, setHostLeaveAgreed] = useState(false)
  const [nextHostId, setNextHostId] = useState('')
  const [reportReason, setReportReason] = useState('')
  const [reportTarget, setReportTarget] = useState<string>('')
  const [timestampReveal, setTimestampReveal] = useState(0)
  const hostGuideStorageKey = useMemo(() => `gatita:room-host-guide:${roomId}`, [roomId])
  const roomGuideStorageKey = useMemo(
    () => `gatita:room-entry-guide:${roomId}:${user?.id ?? 'anonymous'}`,
    [roomId, user?.id]
  )

  const headerRef = useRef<HTMLElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const timestampDragRef = useRef({
    isTracking: false,
    startX: 0,
    startY: 0,
  })
  const supabase = useMemo(() => createClient(), [])

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
    const keyboardInset = visualViewport
      ? Math.max(0, window.innerHeight - visualViewport.height)
      : 0
    const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0
    const composerHeight = composerRef.current?.getBoundingClientRect().height ?? 0

    root.style.setProperty('--chat-header-height', `${Math.ceil(headerHeight)}px`)
    root.style.setProperty('--chat-composer-height', `${Math.ceil(composerHeight)}px`)
    root.style.setProperty('--chat-keyboard-inset', `${Math.ceil(keyboardInset)}px`)
  }, [])

  const syncAndPinChat = useCallback(() => {
    syncChatChrome()
    requestAnimationFrame(keepWindowPinned)
  }, [keepWindowPinned, syncChatChrome])

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
      resizeObserver?.disconnect()
      window.visualViewport?.removeEventListener('resize', syncAndPinChat)
      window.removeEventListener('resize', syncAndPinChat)
      window.removeEventListener('orientationchange', syncAndPinChat)
      window.removeEventListener('scroll', keepWindowPinned)
    }
  }, [keepWindowPinned, syncAndPinChat])

  useEffect(() => {
    scrollToBottom()
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
  }, [loading, messages.length, room, scrollToBottom, syncAndPinChat, user])

  const handleComposerFocus = useCallback(() => {
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
        const { data: payoutAccount, error: payoutError } = await supabase
          .from('user_payout_accounts')
          .select('user_id, bank_name, account_number, account_holder, created_at, updated_at')
          .eq('user_id', data.created_by)
          .maybeSingle()

        if (payoutError) {
          console.error('Load creator payout account error:', payoutError)
          setCreatorPayoutAccount(null)
        } else {
          setCreatorPayoutAccount(payoutAccount)
        }
      } else {
        router.push('/')
      }
    } catch (error) {
      console.error('Load room error:', error)
      router.push('/')
    }
  }, [roomId, router, supabase])

  const loadMessages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id, room_id, user_id, content, created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })

      if (error) throw error

      const messageRows = (data ?? []) as Message[]
      const latestHostAppearance = messageRows
        .map((message) => extractHostAppearanceFromMessage(message.content))
        .filter(Boolean)
        .at(-1) ?? ''
      const visibleMessageRows = messageRows.filter((message) => !extractHostAppearanceFromMessage(message.content))
      const authorIds = Array.from(new Set(visibleMessageRows.map((message) => message.user_id)))
      const authorsById = new Map<string, Pick<User, 'id' | 'nickname' | 'department'>>()

      if (latestHostAppearance) {
        setHostAppearance(latestHostAppearance)
      }

      if (authorIds.length > 0) {
        const { data: authors, error: authorError } = await supabase
          .from('users')
          .select('id, nickname, department')
          .in('id', authorIds)

        if (authorError) {
          console.error('Load message authors error:', authorError)
        } else {
          authors?.forEach((author) => {
            authorsById.set(author.id, author as Pick<User, 'id' | 'nickname' | 'department'>)
          })
        }
      }

      const messagesWithAuthors = visibleMessageRows.map((message) => ({
        ...message,
        user: authorsById.get(message.user_id),
      }))

      setMessages(messagesWithAuthors as Message[])
    } catch (error) {
      console.error('Load messages error:', error)
    }
  }, [roomId, supabase])

  const loadParticipants = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('room_participants')
        .select(`
          *,
          user:users(nickname, department, phone)
        `)
        .eq('room_id', roomId)

      if (data) {
        setParticipants(data as any)
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
        .single()

      if (data) {
        setIsConfirmed(data.confirmed)
      }
    } catch (error) {
      // 참여자가 아닌 경우
    }
  }, [roomId, supabase])

  const checkAuthAndLoadData = useCallback(async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()

      if (!authUser) {
        router.push('/')
        return
      }

      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle()

      if (!userData) {
        router.push('/')
        return
      }

      setUser(userData)
      await Promise.all([
        loadRoom(),
        loadMessages(),
        loadParticipants(),
        checkParticipation(userData.id)
      ])
    } catch (error) {
      console.error('Auth/data loading error:', error)
      router.push('/')
    } finally {
      setLoading(false)
    }
  }, [checkParticipation, loadMessages, loadParticipants, loadRoom, router, supabase])

  useEffect(() => {
    if (!roomId) {
      router.push('/')
      return
    }

    checkAuthAndLoadData()
  }, [checkAuthAndLoadData, roomId, router])

  useEffect(() => {
    if (!room) return

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
          if (payload.new.user_id !== user?.id) {
            loadMessages()
          }
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
        () => {
          loadParticipants()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(messagesChannel)
      supabase.removeChannel(participantsChannel)
    }
  }, [loadMessages, loadParticipants, room, roomId, supabase, user?.id])

  useEffect(() => {
    if (loading || !room || !user) return
    if (room.created_by !== user.id) return
    if (window.localStorage.getItem(hostGuideStorageKey)) return

    setShowHostGuide(true)
  }, [hostGuideStorageKey, loading, room, user])

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

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user) return

    const tempMessage = {
      id: `temp-${Date.now()}`,
      content: newMessage.trim(),
      user_id: user.id,
      room_id: roomId,
      created_at: new Date().toISOString(),
      user: {
        nickname: user.nickname,
        department: user.department
      }
    }

    // 즉시 UI에 메시지 추가 (낙관적 업데이트)
    setMessages(prev => [...prev, tempMessage as any])
    setNewMessage('')

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          room_id: roomId,
          user_id: user.id,
          content: tempMessage.content
        })

      if (error) throw error

      // 서버에서 실제 메시지 다시 로드
      await loadMessages()
    } catch (error) {
      // 오류 시 임시 메시지 제거하고 입력창에 다시 표시
      setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id))
      setNewMessage(tempMessage.content)
      console.error('Send message error:', error)
      toast.error('메시지 전송 중 오류가 발생했습니다')
    }
  }

  const handleConfirmParticipation = async () => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('room_participants')
        .update({ confirmed: true })
        .eq('room_id', roomId)
        .eq('user_id', user.id)

      if (error) throw error

      setIsConfirmed(true)
      toast.success('참여가 확정되었습니다!')
    } catch (error) {
      console.error('Confirm participation error:', error)
      toast.error('참여 확정 중 오류가 발생했습니다')
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
      creatorPayoutAccount.account_number,
      creatorPayoutAccount.account_holder,
    ].filter(Boolean).join(' ')

    try {
      await navigator.clipboard.writeText(accountText)
      toast.success('계좌 정보를 복사했습니다')
    } catch (error) {
      console.error('Copy creator payout account error:', error)
      toast.error('계좌 정보를 복사하지 못했습니다')
    }
  }, [creatorPayoutAccount])

  const handleCallParticipant = useCallback((participant: RoomParticipant) => {
    if (!participant.user?.phone) {
      toast.error('전화번호가 등록되지 않았습니다')
      return
    }

    setSelectedCallParticipant(participant)
    setShowCallConsentModal(true)
  }, [])

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

      window.localStorage.setItem(hostGuideStorageKey, 'true')
      setHostAppearance(hostAppearanceDraft.trim())
      setShowHostGuide(false)
      setHostAppearanceDraft('')
      await loadMessages()
      toast.success('방장 안내가 저장되었습니다')
    } catch (error) {
      console.error('Save host guide error:', error)
      toast.error('방장 안내 저장 중 오류가 발생했습니다')
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
            <p className="mt-1 truncate text-xs font-semibold text-gray-900">
              {creatorPayoutAccount.bank_name} {creatorPayoutAccount.account_number} {creatorPayoutAccount.account_holder}
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
              className="btn-primary w-full py-2 text-sm"
            >
              참여 확정하기
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
        {messages.map((message) => (
          <div
            key={message.id}
            className={`chat-message-row flex w-full min-w-0 ${message.user_id === user.id ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`chat-message-bubble-stack min-w-0 max-w-[min(78vw,18rem)] ${message.user_id === user.id ? 'ml-7' : 'mr-7'}`}>
              {message.user_id !== user.id && (
                <p className="mb-0.5 truncate px-1 text-xs text-gray-500">
                  {message.user?.nickname} ({message.user?.department})
                </p>
              )}
              <div
                className={`chat-message max-w-full ${
                  message.user_id === user.id ? 'chat-message-own' : 'chat-message-other'
                }`}
              >
                {message.content}
              </div>
            </div>
            <time className="chat-message-time" dateTime={message.created_at}>
              {format(new Date(message.created_at), 'HH:mm')}
            </time>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 메시지 입력 영역 */}
      <div ref={composerRef} className="chat-composer fixed inset-x-0 z-30 border-t border-gray-100 bg-white px-3 pt-3">
        {isParticipant ? (
          <div className="flex min-w-0 items-center gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              onPointerDown={handleComposerInputPointerDown}
              onFocus={handleComposerFocus}
              placeholder="메시지를 입력하세요..."
              className="min-w-0 flex-1 rounded-full border border-gray-200 px-4 py-2 focus:border-primary-600 focus:ring-2 focus:ring-primary-100"
            />
            <button
              onClick={handleSendMessage}
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
              {participants.map(participant => (
                <div
                  key={participant.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-sm font-bold text-gray-950">{participant.user?.nickname}</p>
                      {participant.user_id === room.created_by && (
                        <span className="shrink-0 rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold text-primary-700">
                          방장
                        </span>
                      )}
                      {participant.confirmed && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{participant.user?.department}</p>
                    {participant.user_id === room.created_by && hostAppearance && (
                      <p className="mt-1 max-w-[13rem] rounded-lg bg-white px-2 py-1 text-[11px] font-bold leading-4 text-gray-600">
                        🧍 {hostAppearance}
                      </p>
                    )}
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
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 방장 최초 안내 모달 */}
      {showHostGuide && (
        <div className="fixed inset-0 z-50 flex items-end bg-gray-950/35 px-3 pb-3 pt-16">
          <div className="w-full rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-[0.08em] text-primary-600">방장 안내</p>
              <h2 className="mt-1 text-lg font-extrabold text-gray-950">출발 전 확인해주세요</h2>
            </div>

            <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-[11px] font-medium leading-4 text-gray-600">
              <div className="flex gap-2.5">
                <span className="shrink-0">💳</span>
                <p>정산이 필요할 경우 방장이 결제 후 정산해요.</p>
              </div>
              <div className="flex gap-1.5">
                <span className="shrink-0">🤝</span>
                <p className="whitespace-nowrap text-[9.5px] leading-4 tracking-[-0.08em]">
                  출발 5분 전부터는 갑자기 방을 나가면 서비스 이용이 정지될 수 있어요
                </p>
              </div>
              <div className="flex gap-2.5">
                <span className="shrink-0">📞</span>
                <p>
                  방장과 멤버들은 서로 전화번호가 노출될 수 있어요.
                  <br />
                  지각, 노쇼, 출발 위치 확인 등 동행 목적에만 사용해주세요.
                </p>
              </div>
            </div>

            <label className="mt-4 flex items-center gap-2 text-xs font-black text-gray-700" htmlFor="host-appearance">
              <span className="text-base">🧍</span>
              방장 인상착의
            </label>
            <input
              id="host-appearance"
              type="text"
              value={hostAppearanceDraft}
              onChange={(event) => setHostAppearanceDraft(event.target.value)}
              placeholder="예: 검은 백팩, 파란 후드"
              maxLength={60}
              className="input-field mt-1.5 text-sm"
            />

            <button
              type="button"
              onClick={handleSubmitHostGuide}
              disabled={!hostAppearanceDraft.trim() || isSubmittingHostGuide}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-gray-950 text-sm font-black text-white transition hover:bg-gray-800 disabled:bg-gray-300"
            >
              {isSubmittingHostGuide ? '저장 중...' : '확인했어요'}
            </button>
          </div>
        </div>
      )}

      {/* 입장 안내 모달 */}
      {showRoomGuide && (
        <div className="fixed inset-0 z-50 flex items-end bg-gray-950/35 px-3 pb-3 pt-16">
          <div className="w-full rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-[0.08em] text-primary-600">입장 안내</p>
              <h2 className="mt-1 text-lg font-extrabold text-gray-950">동행 전 확인해주세요</h2>
            </div>

            <div className="space-y-2 text-xs font-medium leading-4 text-gray-600">
              <div className="rounded-xl border border-primary-100 bg-primary-50 px-3 py-2.5">
                <p className="text-xs font-black text-primary-700">🧍 방장 인상착의</p>
                <p className="mt-1 text-sm font-black text-gray-950">
                  {hostAppearance || '방장이 아직 인상착의를 입력하지 않았습니다.'}
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                🧭 꼭 도착지까지 가지 않아도 동행에 참여할 수 있어요. 중간에 헤어질 예정이면 채팅에서 먼저 알려주세요.
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                ⏰ 출발 5분 전부터는 갑자기 방을 나가면 서비스 이용이 정지될 수 있어요
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5">
                방장과 멤버들은 서로 전화번호가 노출될 수 있어요. 지각, 노쇼, 출발 위치 확인 등 동행 목적에만 사용해주세요.
              </div>
            </div>

            <button
              type="button"
              onClick={closeRoomGuide}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-gray-950 text-sm font-black text-white transition hover:bg-gray-800"
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
                className="input-field text-sm font-bold"
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
