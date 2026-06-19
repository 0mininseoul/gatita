'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle, Eye, Flag, MessageCircle, RefreshCw, Search, Shield, Users } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { LOCATIONS, type LocationType } from '@/lib/supabase'

type TabType = 'overview' | 'reports' | 'users' | 'rooms' | 'messages'
type ModerationActionType = 'warning' | 'suspend_7d' | 'suspend_30d' | 'suspend_permanent' | 'release'

type AdminUser = {
  id: string
  email: string
  nickname: string
  department: string
  is_admin: boolean
  status: 'active' | 'suspended'
}

type ManagedUser = {
  id: string
  email: string
  name: string
  phone: string
  nickname: string
  department: string
  status: 'active' | 'suspended'
  is_admin: boolean
  created_at: string
}

type AdminReport = {
  id: string
  room_id?: string | null
  reporter_id?: string
  reported_id?: string
  reason: string
  status: 'pending' | 'reviewed' | 'resolved'
  created_at: string
  reporter?: { nickname?: string; email?: string; department?: string } | null
  reported?: { nickname?: string; email?: string; department?: string } | null
  room?: {
    title?: string
    from_location?: LocationType
    to_location?: LocationType
    departure_date?: string
    departure_time?: string
  } | null
}

type AdminRoom = {
  id: string
  title: string
  departure_date: string
  departure_time: string
  max_participants: number
  from_location: LocationType
  to_location: LocationType
  status: 'active' | 'closed'
  created_at: string
  creator?: { nickname?: string; department?: string } | null
  participants?: Array<{
    id: string
    user_id: string
    user?: { nickname?: string; department?: string } | null
  }>
}

type AdminMessage = {
  id: string
  room_id: string
  content: string
  created_at: string
  user?: { nickname?: string; department?: string } | null
}

type DashboardData = {
  adminUser: AdminUser
  users: ManagedUser[]
  reports: AdminReport[]
  rooms: AdminRoom[]
  messages: AdminMessage[]
}

const STATUS_LABELS = {
  active: '활성',
  suspended: '정지',
  pending: '대기',
  reviewed: '검토',
  resolved: '완료',
  closed: '종료',
}

const MODERATION_ACTIONS: Array<{
  action: ModerationActionType
  label: string
  className: string
}> = [
  { action: 'warning', label: '경고', className: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' },
  { action: 'suspend_7d', label: '7일 정지', className: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100' },
  { action: 'suspend_30d', label: '30일 정지', className: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' },
  { action: 'suspend_permanent', label: '영구 정지', className: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' },
  { action: 'release', label: '해제', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
]

function statusClass(status: string) {
  if (status === 'active' || status === 'resolved') return 'bg-emerald-50 text-emerald-700 ring-emerald-100'
  if (status === 'pending') return 'bg-amber-50 text-amber-700 ring-amber-100'
  if (status === 'reviewed') return 'bg-blue-50 text-blue-700 ring-blue-100'
  return 'bg-rose-50 text-rose-700 ring-rose-100'
}

function formatAdminDate(date: string) {
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}

function formatAdminRoomTitle(room: {
  title?: string
  from_location?: LocationType
  to_location?: LocationType
  departure_date?: string
  departure_time?: string
}) {
  if (!room.departure_date || !room.departure_time || !room.from_location || !room.to_location) {
    return room.title ?? '방 정보 없음'
  }

  const fromLabel = LOCATIONS[room.from_location] ?? room.from_location
  const toLabel = LOCATIONS[room.to_location] ?? room.to_location

  return `[${formatAdminDate(room.departure_date)}] ${room.departure_time.slice(0, 5)} ${fromLabel}→${toLabel}`
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string | number
  detail: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-[0_10px_24px_rgba(17,24,39,0.04)]">
      <p className="text-xs font-black text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-gray-950">{value}</p>
      <p className="mt-1 text-xs font-semibold text-gray-500">{detail}</p>
    </div>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [roomDateFilter, setRoomDateFilter] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [adminAccessError, setAdminAccessError] = useState('')

  const loadDashboard = useCallback(async (roomId = selectedRoomId) => {
    setLoading(true)

    try {
      const query = roomId ? `?roomId=${encodeURIComponent(roomId)}` : ''
      const response = await fetch(`/api/admin/dashboard${query}`)
      const result = await response.json().catch(() => null)

      if (response.status === 401 || response.status === 403) {
        setDashboard(null)
        setAdminAccessError(result?.error ?? '관리자 접근 권한을 확인하지 못했습니다')
        return
      }

      if (!response.ok) {
        throw new Error(result?.error ?? '관리자 데이터를 불러오지 못했습니다')
      }

      setAdminAccessError('')
      setDashboard(result)
    } catch (error) {
      console.error('Admin dashboard load error:', error)
      setAdminAccessError(error instanceof Error ? error.message : '관리자 데이터를 불러오지 못했습니다')
      toast.error(error instanceof Error ? error.message : '관리자 데이터를 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [selectedRoomId])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const runAdminAction = async (payload: Record<string, string>) => {
    setIsMutating(true)

    try {
      const response = await fetch('/api/admin/dashboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error ?? '관리자 작업을 처리하지 못했습니다')
      }

      await loadDashboard(selectedRoomId)
      toast.success('변경사항이 반영되었습니다')
    } catch (error) {
      console.error('Admin action error:', error)
      toast.error(error instanceof Error ? error.message : '관리자 작업을 처리하지 못했습니다')
    } finally {
      setIsMutating(false)
    }
  }

  const runModerationAction = (
    userId: string,
    action: ModerationActionType,
    reportId?: string | null,
    reason?: string,
  ) => {
    const payload: Record<string, string> = {
      type: 'moderation-action',
      userId,
      action,
    }

    if (reportId) payload.reportId = reportId
    if (reason?.trim()) payload.reason = reason.trim()

    return runAdminAction(payload)
  }

  const filteredUsers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    if (!dashboard || !keyword) return dashboard?.users ?? []

    return dashboard.users.filter((user) => (
      user.nickname.toLowerCase().includes(keyword)
      || user.email.toLowerCase().includes(keyword)
      || user.department.toLowerCase().includes(keyword)
      || user.phone.includes(keyword)
    ))
  }, [dashboard, searchTerm])

  const activeRooms = dashboard?.rooms.filter((room) => room.status === 'active') ?? []
  const pendingReports = dashboard?.reports.filter((report) => report.status === 'pending') ?? []
  const suspendedUsers = dashboard?.users.filter((user) => user.status === 'suspended') ?? []
  const roomDateOptions = useMemo(() => {
    const dates = Array.from(new Set((dashboard?.rooms ?? []).map((room) => room.departure_date)))
    return dates.sort((a, b) => b.localeCompare(a))
  }, [dashboard?.rooms])
  const roomsByDeparture = useMemo(() => {
    return [...(dashboard?.rooms ?? [])].sort((a, b) => {
      const aStart = `${a.departure_date}T${a.departure_time}`
      const bStart = `${b.departure_date}T${b.departure_time}`
      return aStart.localeCompare(bStart) || a.created_at.localeCompare(b.created_at)
    })
  }, [dashboard?.rooms])
  const filteredRooms = useMemo(() => {
    if (!roomDateFilter) return roomsByDeparture
    return roomsByDeparture.filter((room) => room.departure_date === roomDateFilter)
  }, [roomDateFilter, roomsByDeparture])

  if (loading && !dashboard) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-950">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-center">
        <div>
          <Shield className="mx-auto mb-4 h-12 w-12 text-rose-500" />
          <p className="text-xs font-black text-primary-600">관리자 접근</p>
          <h1 className="mt-1 text-xl font-black text-gray-950">관리자 접근 권한을 확인해주세요</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm font-semibold leading-5 text-gray-500">
            {adminAccessError || '관리자 데이터를 불러오지 못했습니다'}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={() => loadDashboard()} className="btn-primary">
              다시 시도
            </button>
            <button type="button" onClick={() => router.push('/map')} className="btn-secondary">
              지도로
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-950">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-primary-600">같이타 운영</p>
            <h1 className="text-xl font-black">관리자 대시보드</h1>
            <p className="text-xs font-semibold text-gray-500">
              {dashboard.adminUser.nickname} · {dashboard.adminUser.department}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadDashboard()}
              disabled={loading}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 disabled:opacity-50"
              aria-label="새로고침"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={() => router.push('/map')} className="btn-secondary h-10 px-3 text-sm">
              지도로
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-5">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="전체 사용자" value={dashboard.users.length} detail={`정지 ${suspendedUsers.length}명`} />
          <StatCard label="활성 방" value={activeRooms.length} detail={`전체 ${dashboard.rooms.length}개`} />
          <StatCard label="대기 신고" value={pendingReports.length} detail={`전체 ${dashboard.reports.length}건`} />
          <StatCard label="선택 방 메시지" value={dashboard.messages.length} detail={selectedRoomId ? '조회 중' : '방 선택 필요'} />
        </section>

        <nav className="mt-5 flex gap-2 overflow-x-auto rounded-lg border border-gray-200 bg-white p-1">
          {[
            { key: 'overview', label: '요약', icon: Shield },
            { key: 'reports', label: '신고', icon: Flag },
            { key: 'users', label: '사용자', icon: Users },
            { key: 'rooms', label: '방', icon: MessageCircle },
            { key: 'messages', label: '메시지', icon: Search },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key as TabType)}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-black transition ${
                activeTab === key ? 'bg-gray-950 text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        {activeTab === 'overview' && (
          <section className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="text-base font-black">처리 대기 신고</h2>
              <div className="mt-3 space-y-2">
                {pendingReports.slice(0, 5).map((report) => (
                  <div key={report.id} className="rounded-lg bg-amber-50 px-3 py-2 text-sm">
                    <p className="font-black text-amber-900">{report.reported?.nickname ?? '대상 미상'}</p>
                    <p className="line-clamp-2 text-amber-800">{report.reason}</p>
                  </div>
                ))}
                {pendingReports.length === 0 && <p className="text-sm font-semibold text-gray-500">대기 중인 신고가 없습니다</p>}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="text-base font-black">최근 개설 방</h2>
              <div className="mt-3 space-y-2">
                {dashboard.rooms.slice(0, 5).map((room) => (
                  <div
                    key={room.id}
                    className="rounded-lg bg-gray-50 px-3 py-2 text-sm"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRoomId(room.id)
                        setActiveTab('messages')
                        loadDashboard(room.id)
                      }}
                      className="block w-full text-left hover:text-primary-700"
                    >
                      <p className="font-black text-gray-950">{formatAdminRoomTitle(room)}</p>
                      <p className="text-xs font-semibold text-gray-500">
                        {room.participants?.length ?? 0}/{room.max_participants}명 · {room.creator?.nickname ?? '개설자 미상'}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/rooms/${room.id}`)}
                      className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md bg-gray-950 px-2.5 text-xs font-black text-white transition hover:bg-gray-800"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      채팅방 UI로 모니터링
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'reports' && (
          <section className="mt-5 space-y-3">
            {dashboard.reports.map((report) => (
              <article key={report.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-black ring-1 ${statusClass(report.status)}`}>
                      {STATUS_LABELS[report.status]}
                    </span>
                    <p className="mt-2 text-sm font-black text-gray-950">
                      신고 대상: {report.reported?.nickname ?? '알 수 없음'} · 신고자: {report.reporter?.nickname ?? '알 수 없음'}
                    </p>
                    <p className="text-xs font-semibold text-gray-500">
                      {format(new Date(report.created_at), 'yyyy-MM-dd HH:mm')} · {formatAdminRoomTitle(report.room ?? {})}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {report.status === 'pending' && (
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => runAdminAction({ type: 'report-status', reportId: report.id, status: 'reviewed' })}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white disabled:bg-gray-300"
                      >
                        검토
                      </button>
                    )}
                    {report.status !== 'resolved' && (
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => runAdminAction({ type: 'report-status', reportId: report.id, status: 'resolved' })}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:bg-gray-300"
                      >
                        완료
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">{report.reason}</p>
                {report.reported_id && (
                  <div className="mt-3 rounded-lg border border-gray-100 bg-white px-3 py-3">
                    <p className="text-xs font-black text-gray-500">신고 대상 조치</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {MODERATION_ACTIONS.map((action) => (
                        <button
                          key={action.action}
                          type="button"
                          disabled={isMutating}
                          onClick={() => runModerationAction(report.reported_id!, action.action, report.id, report.reason)}
                          className={`rounded-md border px-2.5 py-1.5 text-xs font-black transition disabled:opacity-40 ${action.className}`}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </section>
        )}

        {activeTab === 'users' && (
          <section className="mt-5 rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-black">사용자 관리</h2>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="닉네임, 이메일, 학과, 전화번호"
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm font-semibold text-gray-950 outline-none focus:border-primary-600"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs font-black text-gray-500">
                  <tr>
                    <th className="px-3 py-3">사용자</th>
                    <th className="px-3 py-3">연락처</th>
                    <th className="px-3 py-3">상태</th>
                    <th className="px-3 py-3">가입일</th>
                    <th className="px-3 py-3">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredUsers.map((managedUser) => (
                    <tr key={managedUser.id}>
                      <td className="px-3 py-3">
                        <p className="font-black">{managedUser.nickname}</p>
                        <p className="text-xs font-semibold text-gray-500">{managedUser.name} · {managedUser.department}</p>
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold text-gray-600">
                        <p>{managedUser.phone}</p>
                        <p>{managedUser.email}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-black ring-1 ${statusClass(managedUser.status)}`}>
                          {STATUS_LABELS[managedUser.status]}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold text-gray-500">
                        {format(new Date(managedUser.created_at), 'yyyy-MM-dd')}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex max-w-[260px] flex-wrap gap-1.5">
                          {MODERATION_ACTIONS.map((action) => (
                            <button
                              key={action.action}
                              type="button"
                              disabled={isMutating || managedUser.is_admin}
                              onClick={() => runModerationAction(managedUser.id, action.action)}
                              className={`rounded-md border px-2 py-1.5 text-xs font-black transition disabled:opacity-40 ${action.className}`}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'rooms' && (
          <section className="mt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
              <div>
                <h2 className="text-base font-black text-gray-950">방 목록</h2>
                <p className="text-xs font-semibold text-gray-500">
                  {roomDateFilter ? `${formatAdminDate(roomDateFilter)} 출발 방 ${filteredRooms.length}개` : `전체 방 ${filteredRooms.length}개`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={roomDateFilter}
                  onChange={(event) => setRoomDateFilter(event.target.value)}
                  list="admin-room-date-options"
                  className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-950 outline-none focus:border-primary-600"
                />
                <datalist id="admin-room-date-options">
                  {roomDateOptions.map((date) => (
                    <option key={date} value={date} />
                  ))}
                </datalist>
                {roomDateFilter && (
                  <button
                    type="button"
                    onClick={() => setRoomDateFilter('')}
                    className="h-10 rounded-lg border border-gray-200 px-3 text-xs font-black text-gray-700 transition hover:bg-gray-50"
                  >
                    전체
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {filteredRooms.map((room) => (
                <article key={room.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-black text-gray-950">{formatAdminRoomTitle(room)}</h2>
                      <p className="mt-1 text-xs font-semibold text-gray-500">
                        {room.creator?.nickname ?? '개설자 미상'} · 생성 {format(new Date(room.created_at), 'MM-dd HH:mm')}
                      </p>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-black ring-1 ${statusClass(room.status)}`}>
                      {STATUS_LABELS[room.status]}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm font-black">
                    <span>참여자 {room.participants?.length ?? 0}/{room.max_participants}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRoomId(room.id)
                          setActiveTab('messages')
                          loadDashboard(room.id)
                        }}
                        className="text-primary-600"
                      >
                        대화 보기
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/rooms/${room.id}`)}
                        className="inline-flex items-center gap-1 text-gray-950"
                      >
                        <Eye className="h-4 w-4" />
                        모니터링
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {filteredRooms.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm font-bold text-gray-500">
                선택한 날짜의 방이 없습니다
              </div>
            )}
          </section>
        )}

        {activeTab === 'messages' && (
          <section className="mt-5 rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-black">메시지 조회</h2>
              <select
                value={selectedRoomId}
                onChange={(event) => {
                  setSelectedRoomId(event.target.value)
                  loadDashboard(event.target.value)
                }}
                className="h-10 max-w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-950"
              >
                <option value="">채팅방 선택</option>
                {roomsByDeparture.map((room) => (
                  <option key={room.id} value={room.id}>{formatAdminRoomTitle(room)}</option>
                ))}
              </select>
            </div>
            {!selectedRoomId && (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm font-bold text-gray-500">
                채팅방을 선택하면 메시지가 표시됩니다
              </div>
            )}
            {selectedRoomId && dashboard.messages.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm font-bold text-gray-500">
                메시지가 없습니다
              </div>
            )}
            {dashboard.messages.length > 0 && (
              <div className="max-h-[60vh] space-y-3 overflow-y-auto rounded-lg bg-gray-50 p-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => selectedRoomId && router.push(`/admin/rooms/${selectedRoomId}`)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gray-950 px-3 text-xs font-black text-white transition hover:bg-gray-800"
                  >
                    <Eye className="h-4 w-4" />
                    실제 채팅방 UI로 보기
                  </button>
                </div>
                {dashboard.messages.map((message) => (
                  <div key={message.id} className="rounded-lg bg-white px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-black text-gray-950">
                        {message.user?.nickname ?? '알 수 없음'}
                        <span className="ml-1 text-xs font-semibold text-gray-500">{message.user?.department}</span>
                      </p>
                      <span className="text-xs font-semibold text-gray-400">{format(new Date(message.created_at), 'MM-dd HH:mm')}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-gray-700">{message.content}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {(pendingReports.length > 0 || suspendedUsers.length > 0) && (
          <div className="mt-5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
            {pendingReports.length > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
            대기 신고 {pendingReports.length}건, 정지 사용자 {suspendedUsers.length}명
          </div>
        )}
      </div>
    </main>
  )
}
