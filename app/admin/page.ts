'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User, Report, ChatRoom, Message } from '@/lib/supabase'
import { Users, Flag, MessageCircle, Shield, Eye, Ban, CheckCircle, Clock, Search } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import toast from 'react-hot-toast'

type TabType = 'users' | 'reports' | 'rooms' | 'messages'

export default function AdminPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('reports')
  const [isAuthorized, setIsAuthorized] = useState(false)
  
  // Data states
  const [users, setUsers] = useState<User[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  
  // UI states
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState<string>('')
  const [showUserModal, setShowUserModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  
  const supabase = createClient()

  useEffect(() => {
    checkAuthAndLoadData()
  }, [])

  useEffect(() => {
    if (isAuthorized) {
      loadTabData()
    }
  }, [activeTab, isAuthorized])

  const checkAuthAndLoadData = async () => {
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
        .single()
      
      if (userData) {
        setUser(userData)
        
        // 관리자 권한 확인
        if (userData.is_admin || userData.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
          setIsAuthorized(true)
        } else {
          router.push('/')
          return
        }
      }
    } catch (error) {
      console.error('Auth error:', error)
      router.push('/')
    } finally {
      setLoading(false)
    }
  }

  const loadTabData = async () => {
    try {
      switch (activeTab) {
        case 'users':
          await loadUsers()
          break
        case 'reports':
          await loadReports()
          break
        case 'rooms':
          await loadRooms()
          break
        case 'messages':
          if (selectedRoomId) {
            await loadMessages()
          }
          break
      }
    } catch (error) {
      console.error('Load data error:', error)
    }
  }

  const loadUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (data) setUsers(data)
  }

  const loadReports = async () => {
    const { data } = await supabase
      .from('reports')
      .select(`
        *,
        reporter:reporter_id(nickname, email, department),
        reported:reported_id(nickname, email, department),
        room:room_id(title, from_location, to_location)
      `)
      .order('created_at', { ascending: false })
    
    if (data) setReports(data as any)
  }

  const loadRooms = async () => {
    const { data } = await supabase
      .from('chat_rooms')
      .select(`
        *,
        creator:created_by(nickname, department),
        participants:room_participants(
          id,
          user:users(nickname)
        )
      `)
      .order('created_at', { ascending: false })
    
    if (data) setRooms(data as any)
  }

  const loadMessages = async () => {
    if (!selectedRoomId) return
    
    const { data } = await supabase
      .from('messages')
      .select(`
        *,
        user:users(nickname, department)
      `)
      .eq('room_id', selectedRoomId)
      .order('created_at', { ascending: true })
    
    if (data) setMessages(data as any)
  }

  const handleUserStatusChange = async (userId: string, status: 'active' | 'suspended') => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ status })
        .eq('id', userId)

      if (error) throw error

      await loadUsers()
      toast.success(`사용자가 ${status === 'suspended' ? '정지' : '정지 해제'}되었습니다`)
    } catch (error) {
      console.error('User status change error:', error)
      toast.error('사용자 상태 변경 중 오류가 발생했습니다')
    }
  }

  const handleReportStatusChange = async (reportId: string, status: 'reviewed' | 'resolved') => {
    try {
      const { error } = await supabase
        .from('reports')
        .update({ status })
        .eq('id', reportId)

      if (error) throw error

      await loadReports()
      toast.success('신고 상태가 변경되었습니다')
    } catch (error) {
      console.error('Report status change error:', error)
      toast.error('신고 상태 변경 중 오류가 발생했습니다')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">접근 권한이 없습니다</h1>
          <p className="text-gray-600">관리자만 접근할 수 있는 페이지입니다</p>
        </div>
      </div>
    )
  }

  const filteredUsers = users.filter(user => 
    user.nickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.department.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">관리자 대시보드</h1>
            <p className="text-gray-600">{user?.nickname}님, 관리자 권한으로 로그인됨</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="btn-secondary"
          >
            메인으로
          </button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* 탭 네비게이션 */}
        <div className="bg-white rounded-xl border border-gray-200 mb-8">
          <div className="flex">
            {[
              { key: 'reports', label: '신고 관리', icon: Flag },
              { key: 'users', label: '사용자 관리', icon: Users },
              { key: 'rooms', label: '채팅방 관리', icon: MessageCircle },
              { key: 'messages', label: '메시지 조회', icon: Eye },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as TabType)}
                className={`flex items-center px-6 py-4 font-medium transition-colors ${
                  activeTab === key
                    ? 'text-primary-600 border-b-2 border-primary-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="w-5 h-5 mr-2" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 신고 관리 탭 */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold mb-6">신고 내역</h2>
              
              {reports.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  신고 내역이 없습니다
                </div>
              ) : (
                <div className="space-y-4">
                  {reports.map((report) => (
                    <div key={report.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center mb-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              report.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              report.status === 'reviewed' ? 'bg-blue-100 text-blue-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {report.status === 'pending' ? '대기 중' :
                               report.status === 'reviewed' ? '검토 중' : '처리 완료'}
                            </span>
                            <span className="ml-2 text-sm text-gray-500">
                              {format(new Date(report.created_at), 'yyyy-MM-dd HH:mm')}
                            </span>
                          </div>
                          <p className="font-medium">
                            신고자: {report.reporter?.nickname} ({report.reporter?.department})
                          </p>
                          <p className="font-medium text-red-600">
                            신고당한 사용자: {report.reported?.nickname} ({report.reported?.department})
                          </p>
                          {report.room && (
                            <p className="text-sm text-gray-600">
                              채팅방: {report.room.title}
                            </p>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          {report.status === 'pending' && (
                            <button
                              onClick={() => handleReportStatusChange(report.id, 'reviewed')}
                              className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                            >
                              검토 시작
                            </button>
                          )}
                          {report.status === 'reviewed' && (
                            <button
                              onClick={() => handleReportStatusChange(report.id, 'resolved')}
                              className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                            >
                              처리 완료
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm font-medium text-gray-700 mb-1">신고 사유:</p>
                        <p className="text-sm text-gray-900">{report.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 사용자 관리 탭 */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">사용자 관리</h2>
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="사용자 검색..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <span className="text-sm text-gray-600">
                    총 {filteredUsers.length}명
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">사용자 정보</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">상태</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">가입일</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">{user.nickname}</p>
                            <p className="text-sm text-gray-600">{user.email}</p>
                            <p className="text-sm text-gray-600">{user.department}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            user.status === 'active' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {user.status === 'active' ? '활성' : '정지됨'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {format(new Date(user.created_at), 'yyyy-MM-dd', { locale: ko })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => {
                                setSelectedUser(user)
                                setShowUserModal(true)
                              }}
                              className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleUserStatusChange(
                                user.id, 
                                user.status === 'active' ? 'suspended' : 'active'
                              )}
                              className={`p-1 rounded ${
                                user.status === 'active'
                                  ? 'text-red-600 hover:bg-red-100'
                                  : 'text-green-600 hover:bg-green-100'
                              }`}
                            >
                              {user.status === 'active' ? (
                                <Ban className="w-4 h-4" />
                              ) : (
                                <CheckCircle className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 채팅방 관리 탭 */}
        {activeTab === 'rooms' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold mb-6">채팅방 목록</h2>
              
              <div className="space-y-4">
                {rooms.map((room) => (
                  <div key={room.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 mb-2">{room.title}</h3>
                        <div className="space-y-1 text-sm text-gray-600">
                          <p>개설자: {room.creator?.nickname} ({room.creator?.department})</p>
                          <p>참여자: {room.participants?.length || 0}/{room.max_participants}명</p>
                          <p>생성일: {format(new Date(room.created_at), 'yyyy-MM-dd HH:mm')}</p>
                          <p>출발일시: {format(new Date(`${room.departure_date}T${room.departure_time}`), 'yyyy-MM-dd HH:mm')}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setSelectedRoomId(room.id)
                            setActiveTab('messages')
                          }}
                          className="px-3 py-1 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
                        >
                          대화 기록
                        </button>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          room.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {room.status === 'active' ? '활성' : '종료'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 메시지 조회 탭 */}
        {activeTab === 'messages' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">메시지 조회</h2>
                <select
                  value={selectedRoomId}
                  onChange={(e) => {
                    setSelectedRoomId(e.target.value)
                    if (e.target.value) {
                      loadMessages()
                    }
                  }}
                  className="border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">채팅방을 선택하세요</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.title}
                    </option>
                  ))}
                </select>
              </div>

              {selectedRoomId && messages.length > 0 && (
                <div className="border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div key={message.id} className="flex items-start space-x-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-medium text-sm text-gray-900">
                              {message.user?.nickname}
                            </span>
                            <span className="text-xs text-gray-500">
                              ({message.user?.department})
                            </span>
                            <span className="text-xs text-gray-400">
                              {format(new Date(message.created_at), 'HH:mm')}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700">{message.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedRoomId && messages.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  이 채팅방에는 메시지가 없습니다
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 사용자 상세 모달 */}
      {showUserModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">사용자 상세 정보</h3>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">닉네임</label>
                  <p className="text-sm text-gray-900">{selectedUser.nickname}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">이메일</label>
                  <p className="text-sm text-gray-900">{selectedUser.email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">실명</label>
                  <p className="text-sm text-gray-900">{selectedUser.name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">전화번호</label>
                  <p className="text-sm text-gray-900">{selectedUser.phone}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">학과</label>
                  <p className="text-sm text-gray-900">{selectedUser.department}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">상태</label>
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                    selectedUser.status === 'active' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {selectedUser.status === 'active' ? '활성' : '정지됨'}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">가입일</label>
                  <p className="text-sm text-gray-900">
                    {format(new Date(selectedUser.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}
                  </p>
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => setShowUserModal(false)}
                  className="btn-secondary flex-1"
                >
                  닫기
                </button>
                <button
                  onClick={() => {
                    handleUserStatusChange(
                      selectedUser.id, 
                      selectedUser.status === 'active' ? 'suspended' : 'active'
                    )
                    setShowUserModal(false)
                  }}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm ${
                    selectedUser.status === 'active'
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {selectedUser.status === 'active' ? '사용자 정지' : '정지 해제'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
