'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle, Eye, Flag, MessageCircle, RefreshCw, Search, Shield, Users } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

type TabType = 'overview' | 'reports' | 'users' | 'rooms' | 'messages'

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
  reason: string
  status: 'pending' | 'reviewed' | 'resolved'
  created_at: string
  reporter?: { nickname?: string; email?: string; department?: string } | null
  reported?: { nickname?: string; email?: string; department?: string } | null
  room?: { title?: string; from_location?: string; to_location?: string } | null
}

type AdminRoom = {
  id: string
  title: string
  departure_date: string
  departure_time: string
  max_participants: number
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

function statusClass(status: string) {
  if (status === 'active' || status === 'resolved') return 'bg-emerald-50 text-emerald-700 ring-emerald-100'
  if (status === 'pending') return 'bg-amber-50 text-amber-700 ring-amber-100'
  if (status === 'reviewed') return 'bg-blue-50 text-blue-700 ring-blue-100'
  return 'bg-rose-50 text-rose-700 ring-rose-100'
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
  const [selectedRoomId, setSelectedRoomId] = useState('')

  const loadDashboard = useCallback(async (roomId = selectedRoomId) => {
    setLoading(true)

    try {
      const query = roomId ? `?roomId=${encodeURIComponent(roomId)}` : ''
      const response = await fetch(`/api/admin/dashboard${query}`)
      const result = await response.json().catch(() => null)

      if (response.status === 401 || response.status === 403) {
        router.push('/map')
        return
      }

      if (!response.ok) {
        throw new Error(result?.error ?? '관리자 데이터를 불러오지 못했습니다')
      }

      setDashboard(result)
    } catch (error) {
      console.error('Admin dashboard load error:', error)
      toast.error(error instanceof Error ? error.message : '관리자 데이터를 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [router, selectedRoomId])

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
          <h1 className="text-xl font-black text-gray-950">관리자 데이터를 불러오지 못했습니다</h1>
          <button type="button" onClick={() => loadDashboard()} className="btn-primary mt-4">
            다시 시도
          </button>
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
                      <p className="font-black text-gray-950">{room.title}</p>
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
                      {format(new Date(report.created_at), 'yyyy-MM-dd HH:mm')} · {report.room?.title ?? '방 정보 없음'}
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
                        <button
                          type="button"
                          disabled={isMutating || managedUser.is_admin}
                          onClick={() => runAdminAction({
                            type: 'user-status',
                            userId: managedUser.id,
                            status: managedUser.status === 'active' ? 'suspended' : 'active',
                          })}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 disabled:opacity-40"
                        >
                          {managedUser.status === 'active' ? '정지' : '해제'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'rooms' && (
          <section className="mt-5 grid gap-3 md:grid-cols-2">
            {dashboard.rooms.map((room) => (
              <article key={room.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-black text-gray-950">{room.title}</h2>
                    <p className="mt-1 text-xs font-semibold text-gray-500">
                      {room.creator?.nickname ?? '개설자 미상'} · {format(new Date(`${room.departure_date}T${room.departure_time}+09:00`), 'MM-dd HH:mm')}
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
                {dashboard.rooms.map((room) => (
                  <option key={room.id} value={room.id}>{room.title}</option>
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
