'use client'

import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ChatRoom, User, Message, RoomParticipant, PayoutAccount, LOCATIONS } from '@/lib/supabase'
import { ArrowLeft, Users, Clock, Send, Flag, Check, X, LogOut, Phone, CreditCard } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import toast from 'react-hot-toast'

const MAX_TIMESTAMP_REVEAL = 68

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
  const [reportReason, setReportReason] = useState('')
  const [reportTarget, setReportTarget] = useState<string>('')
  const [timestampReveal, setTimestampReveal] = useState(0)

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
      const authorIds = Array.from(new Set(messageRows.map((message) => message.user_id)))
      const authorsById = new Map<string, Pick<User, 'id' | 'nickname' | 'department'>>()

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

      const messagesWithAuthors = messageRows.map((message) => ({
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

  const handleLeaveRoom = async () => {
    if (!user) return

    if (!confirm('정말로 채팅방을 나가시겠습니까?')) return

    try {
      // 현재 참여자 수 확인
      const { data: currentParticipants } = await supabase
        .from('room_participants')
        .select('id')
        .eq('room_id', roomId)

      const participantCount = currentParticipants?.length || 0

      // 참여자에서 제거
      const { error: leaveError } = await supabase
        .from('room_participants')
        .delete()
        .eq('room_id', roomId)
        .eq('user_id', user.id)

      if (leaveError) throw leaveError

      if (participantCount <= 1) {
        await supabase
          .from('chat_rooms')
          .update({ status: 'closed' })
          .eq('id', roomId)
          .eq('created_by', user.id)

        toast.success('채팅방을 나갔습니다')
      } else {
        toast.success('채팅방을 나갔습니다')
      }

      router.push('/map')
    } catch (error) {
      console.error('Leave room error:', error)
      toast.error('채팅방 나가기 중 오류가 발생했습니다')
    }
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

  const isParticipant = participants.some(p => p.user_id === user?.id)

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
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white">
                  {participants.length}
                </span>
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
          <div className="flex items-center gap-1.5 text-xs font-bold text-primary-700">
            <CreditCard className="h-3.5 w-3.5" />
            <span>방장 계좌</span>
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
                  </div>
                  <a
                    href={`tel:${participant.user?.phone}`}
                    aria-label={`${participant.user?.nickname ?? '참여자'}에게 전화하기`}
                    aria-disabled={!participant.user?.phone}
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      participant.user?.phone
                        ? 'bg-primary-600 text-white hover:bg-primary-700'
                        : 'pointer-events-none bg-gray-200 text-gray-400'
                    }`}
                  >
                    <Phone className="h-5 w-5" />
                  </a>
                </div>
              ))}
            </div>
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
