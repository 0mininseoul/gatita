'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Clock, CreditCard, Eye, RefreshCw, Users, X } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { LOCATIONS, type LocationType } from '@/lib/supabase'

const HOST_APPEARANCE_MESSAGE_PREFIX = '__gatita_host_appearance__:'
const LEGACY_HOST_APPEARANCE_MESSAGE_PREFIX = '방장 인상착의:'

type MonitorParticipant = {
  id: string
  user_id: string
  confirmed?: boolean
  user?: {
    nickname?: string
    department?: string
  } | null
}

type MonitorPayoutAccount = {
  user_id: string
  bank_name: string
  account_number: string
  account_holder: string
}

type MonitorRoom = {
  id: string
  title: string
  from_location: LocationType
  to_location: LocationType
  departure_date: string
  departure_time: string
  max_participants: number
  created_by: string
  status: 'active' | 'closed'
  creator?: {
    nickname?: string
    department?: string
  } | null
  participants?: MonitorParticipant[]
  creatorPayoutAccount?: MonitorPayoutAccount | null
}

type MonitorMessage = {
  id: string
  room_id: string
  user_id: string
  content: string
  created_at: string
  user?: {
    nickname?: string
    department?: string
  } | null
}

type DashboardResponse = {
  rooms: MonitorRoom[]
  messages: MonitorMessage[]
}

function isErrorResponse(result: DashboardResponse | { error?: string } | null): result is { error?: string } {
  return Boolean(result && 'error' in result)
}

function extractHostAppearanceFromMessage(content: string) {
  if (content.startsWith(HOST_APPEARANCE_MESSAGE_PREFIX)) {
    return content.slice(HOST_APPEARANCE_MESSAGE_PREFIX.length).trim()
  }

  if (content.startsWith(LEGACY_HOST_APPEARANCE_MESSAGE_PREFIX)) {
    return content.slice(LEGACY_HOST_APPEARANCE_MESSAGE_PREFIX.length).trim()
  }

  return ''
}

export default function AdminRoomMonitorPage() {
  const params = useParams()
  const router = useRouter()
  const roomId = params.id as string
  const [room, setRoom] = useState<MonitorRoom | null>(null)
  const [messages, setMessages] = useState<MonitorMessage[]>([])
  const [hostAppearance, setHostAppearance] = useState('')
  const [showParticipants, setShowParticipants] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [adminAccessError, setAdminAccessError] = useState('')
  const headerRef = useRef<HTMLElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)

  const participants = useMemo(() => room?.participants ?? [], [room?.participants])
  const creatorPayoutAccount = room?.creatorPayoutAccount ?? null

  const monitorStyle = useMemo(() => ({
    '--timestamp-reveal': '0px',
    '--timestamp-opacity': '1',
  }) as CSSProperties, [])

  const syncMonitorChrome = useCallback(() => {
    const root = document.documentElement
    const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0
    const composerHeight = composerRef.current?.getBoundingClientRect().height ?? 0

    root.style.setProperty('--chat-header-height', `${Math.ceil(headerHeight)}px`)
    root.style.setProperty('--chat-composer-height', `${Math.ceil(composerHeight)}px`)
    root.style.setProperty('--chat-keyboard-inset', '0px')
  }, [])

  const loadMonitor = useCallback(async (quiet = false) => {
    if (!roomId) return

    if (quiet) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const response = await fetch(`/api/admin/dashboard?roomId=${encodeURIComponent(roomId)}`, {
        cache: 'no-store',
      })
      const result = await response.json().catch(() => null) as DashboardResponse | { error?: string } | null

      if (response.status === 401 || response.status === 403) {
        setRoom(null)
        setMessages([])
        setAdminAccessError(result && isErrorResponse(result) ? result.error ?? '관리자 접근 권한을 확인하지 못했습니다' : '관리자 접근 권한을 확인하지 못했습니다')
        return
      }

      if (!response.ok || !result || isErrorResponse(result)) {
        throw new Error(isErrorResponse(result) ? result.error ?? '채팅방 모니터링 데이터를 불러오지 못했습니다' : '채팅방 모니터링 데이터를 불러오지 못했습니다')
      }

      const selectedRoom = result.rooms.find((candidate) => candidate.id === roomId)
      if (!selectedRoom) {
        throw new Error('채팅방을 찾지 못했습니다')
      }

      const latestHostAppearance = result.messages
        .map((message) => extractHostAppearanceFromMessage(message.content))
        .filter(Boolean)
        .at(-1) ?? ''
      const visibleMessages = result.messages.filter((message) => !extractHostAppearanceFromMessage(message.content))

      setRoom(selectedRoom)
      setMessages(visibleMessages)
      setHostAppearance(latestHostAppearance)
      setLastUpdatedAt(new Date())
      setAdminAccessError('')
    } catch (error) {
      console.error('Admin room monitor load error:', error)
      setAdminAccessError(error instanceof Error ? error.message : '채팅방 모니터링 데이터를 불러오지 못했습니다')
      toast.error(error instanceof Error ? error.message : '채팅방 모니터링 데이터를 불러오지 못했습니다')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [roomId])

  useEffect(() => {
    loadMonitor()
    const intervalId = window.setInterval(() => loadMonitor(true), 5000)

    return () => window.clearInterval(intervalId)
  }, [loadMonitor])

  useLayoutEffect(() => {
    if (!room) return

    const root = document.documentElement
    const body = document.body
    const previousRootOverflow = root.style.overflow
    const previousBodyOverflow = body.style.overflow
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior

    syncMonitorChrome()
    window.scrollTo(0, 0)
    root.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncMonitorChrome)
      : null
    if (headerRef.current) resizeObserver?.observe(headerRef.current)
    if (composerRef.current) resizeObserver?.observe(composerRef.current)

    window.addEventListener('resize', syncMonitorChrome)
    window.addEventListener('orientationchange', syncMonitorChrome)

    return () => {
      root.style.overflow = previousRootOverflow
      body.style.overflow = previousBodyOverflow
      body.style.overscrollBehavior = previousBodyOverscrollBehavior
      root.style.removeProperty('--chat-header-height')
      root.style.removeProperty('--chat-composer-height')
      root.style.removeProperty('--chat-keyboard-inset')
      resizeObserver?.disconnect()
      window.removeEventListener('resize', syncMonitorChrome)
      window.removeEventListener('orientationchange', syncMonitorChrome)
    }
  }, [room, syncMonitorChrome])

  useEffect(() => {
    if (!messagesScrollRef.current) return

    messagesScrollRef.current.scrollTo({
      top: messagesScrollRef.current.scrollHeight,
      behavior: loading ? 'auto' : 'smooth',
    })
  }, [loading, messages.length])

  if (loading && !room) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-950">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-center">
        <div>
          <Eye className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h1 className="text-xl font-black text-gray-950">채팅방을 불러오지 못했습니다</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm font-semibold leading-5 text-gray-500">
            {adminAccessError || '관리자 모니터링 데이터를 확인하지 못했습니다'}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={() => loadMonitor()} className="btn-primary">
              다시 시도
            </button>
            <button type="button" onClick={() => router.push('/admin')} className="btn-secondary">
              대시보드
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-shell fixed inset-0 w-screen max-w-full overflow-hidden overscroll-none app-bg">
      <header ref={headerRef} className="chat-room-header fixed inset-x-0 z-30 overflow-hidden px-3 pb-2">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="flex min-w-0 items-start">
            <button
              type="button"
              aria-label="관리자 대시보드로 돌아가기"
              onClick={() => router.push('/admin')}
              className="mr-2 shrink-0 rounded-lg p-2 hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-gray-950 px-2 py-0.5 text-[10px] font-black text-white">
                <Eye className="h-3 w-3" />
                관리자 모니터링
              </div>
              <h1 className="truncate text-sm font-semibold text-gray-900">
                {LOCATIONS[room.from_location]} → {LOCATIONS[room.to_location]}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                <Clock className="mr-1 h-4 w-4" />
                <span>{format(new Date(`${room.departure_date}T${room.departure_time}`), 'M월 d일 HH:mm', { locale: ko })}</span>
                <span className="inline-flex items-center">
                  <Users className="mr-1 h-4 w-4" />
                  {participants.length}/{room.max_participants}
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="참여자 보기"
              onClick={() => setShowParticipants(true)}
              className="rounded-lg p-2 text-gray-700 hover:bg-gray-100"
            >
              <Users className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="새로고침"
              onClick={() => loadMonitor(true)}
              disabled={refreshing}
              className="rounded-lg p-2 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="mt-2 rounded-xl border border-primary-100 bg-primary-50/90 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary-700">
              <CreditCard className="h-3.5 w-3.5" />
              <span>방장 계좌</span>
            </div>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-primary-700 ring-1 ring-primary-100">
              읽기 전용
            </span>
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
      </header>

      <div
        ref={messagesScrollRef}
        className="chat-messages absolute left-0 right-0 top-0 space-y-2 overflow-y-auto overflow-x-hidden px-3"
        style={monitorStyle}
      >
        {messages.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-white/80 px-4 py-8 text-center text-sm font-bold text-gray-500">
            아직 메시지가 없습니다
          </div>
        ) : (
          messages.map((message, index) => {
            const previousMessage = messages[index - 1]
            const nextMessage = messages[index + 1]
            const startsMessageGroup = !previousMessage || previousMessage.user_id !== message.user_id
            const endsMessageGroup = !nextMessage || nextMessage.user_id !== message.user_id

            return (
              <div
                key={message.id}
                className={`chat-message-row is-admin-monitor flex w-full min-w-0 justify-start ${startsMessageGroup ? 'is-new-author' : 'is-same-author'}`}
              >
                <div className="chat-message-bubble-stack mr-7 min-w-0 max-w-[min(78vw,18rem)]">
                  {startsMessageGroup && (
                    <p className="chat-message-author">
                      {message.user?.nickname ?? '알 수 없음'} ({message.user?.department ?? '학과 미상'})
                    </p>
                  )}
                  <div
                    className={`chat-message chat-message-other max-w-full ${startsMessageGroup ? 'chat-message-group-start' : 'chat-message-group-follow'} ${endsMessageGroup ? 'chat-message-group-end' : 'chat-message-group-continue'}`}
                  >
                    {message.content}
                  </div>
                </div>
                <time className="chat-message-time" dateTime={message.created_at}>
                  {format(new Date(message.created_at), 'HH:mm')}
                </time>
              </div>
            )
          })
        )}
      </div>

      <div ref={composerRef} className="chat-composer fixed inset-x-0 z-30 border-t border-gray-100 bg-white px-3 pt-3">
        <div className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-center text-sm font-black text-gray-500">
          관리자 모니터링 중입니다 · 메시지 전송은 비활성화되어 있습니다
          {lastUpdatedAt && (
            <span className="ml-2 text-xs font-bold text-gray-400">
              {format(lastUpdatedAt, 'HH:mm:ss')} 갱신
            </span>
          )}
        </div>
      </div>

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
              {participants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-sm font-bold text-gray-950">{participant.user?.nickname ?? '알 수 없음'}</p>
                      {participant.user_id === room.created_by && (
                        <span className="shrink-0 rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold text-primary-700">
                          방장
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{participant.user?.department ?? '학과 미상'}</p>
                    {participant.user_id === room.created_by && hostAppearance && (
                      <p className="mt-1 max-w-[13rem] rounded-lg bg-white px-2 py-1 text-[11px] font-bold leading-4 text-gray-600">
                        🧍 {hostAppearance}
                      </p>
                    )}
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                    participant.confirmed
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {participant.confirmed ? '확정' : '대기'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
