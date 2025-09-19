'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ChatRoom, User, Message, RoomParticipant, LOCATIONS } from '@/lib/supabase'
import { ArrowLeft, Users, Clock, Send, Flag, Check, X } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import toast from 'react-hot-toast'

export default function ChatRoomPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.id as string
  
  const [user, setUser] = useState<User | null>(null)
  const [room, setRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [participants, setParticipants] = useState<RoomParticipant[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportTarget, setReportTarget] = useState<string>('')
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!roomId) {
      router.push('/')
      return
    }
    
    checkAuthAndLoadData()
  }, [roomId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!room) return

    // 실시간 메시지 구독
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
          // 본인이 보낸 메시지가 아닐 때만 새로고침
          if (payload.new.user_id !== user?.id) {
            loadMessages()
          }
        }
      )
      .subscribe()

    // 참여자 변경 구독
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
        (payload) => {
          loadParticipants()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(messagesChannel)
      supabase.removeChannel(participantsChannel)
    }
  }, [room, user?.id])

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
        await Promise.all([
          loadRoom(),
          loadMessages(),
          loadParticipants(),
          checkParticipation(userData.id)
        ])
      }
    } catch (error) {
      console.error('Auth/data loading error:', error)
      router.push('/')
    } finally {
      setLoading(false)
    }
  }

  const loadRoom = async () => {
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
  }

  const loadMessages = async () => {
    try {
      const { data } = await supabase
        .from('messages')
        .select(`
          *,
          user:users(nickname, department)
        `)
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
      
      if (data) {
        setMessages(data as any)
      }
    } catch (error) {
      console.error('Load messages error:', error)
    }
  }

  const loadParticipants = async () => {
    try {
      const { data } = await supabase
        .from('room_participants')
        .select(`
          *,
          user:users(nickname, department)
        `)
        .eq('room_id', roomId)
      
      if (data) {
        setParticipants(data as any)
      }
    } catch (error) {
      console.error('Load participants error:', error)
    }
  }

  const checkParticipation = async (userId: string) => {
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
  }

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

      // 마지막 참여자였다면 채팅방과 관련 데이터 삭제
      if (participantCount <= 1) {
        // 메시지 먼저 삭제
        await supabase
          .from('messages')
          .delete()
          .eq('room_id', roomId)

        // 신고 내역 삭제
        await supabase
          .from('reports')
          .delete()
          .eq('room_id', roomId)

        // 채팅방 삭제
        await supabase
          .from('chat_rooms')
          .delete()
          .eq('id', roomId)

        toast.success('채팅방을 나갔습니다. 빈 채팅방이 삭제되었습니다.')
      } else {
        toast.success('채팅방을 나갔습니다')
      }

      router.back()
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={() => router.back()}
              className="p-2 mr-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-semibold text-gray-900">
                {LOCATIONS[room.from_location]} → {LOCATIONS[room.to_location]}
              </h1>
              <div className="flex items-center text-sm text-gray-600">
                <Clock className="w-4 h-4 mr-1" />
                {format(new Date(`${room.departure_date}T${room.departure_time}`), 'M월 d일 HH:mm', { locale: ko })}
                <Users className="w-4 h-4 ml-3 mr-1" />
                {participants.length}/{room.max_participants}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowReportModal(true)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <Flag className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* 참여자 목록 */}
        <div className="mt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">참여자</h3>
          <div className="flex flex-wrap gap-2">
            {participants.map(participant => (
              <div
                key={participant.id}
                className={`px-3 py-1 rounded-full text-sm flex items-center ${
                  participant.confirmed 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {participant.confirmed && <Check className="w-3 h-3 mr-1" />}
                {participant.user?.nickname}
                <span className="ml-1 text-xs">({participant.user?.department})</span>
                {participant.user_id === room.created_by && (
                  <span className="ml-1 text-xs font-medium">방장</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 참여 확정 버튼 */}
        {isParticipant && !isConfirmed && (
          <div className="mt-4">
            <button
              onClick={handleConfirmParticipation}
              className="btn-primary w-full text-sm py-2"
            >
              참여 확정하기
            </button>
            <p className="text-xs text-gray-500 mt-1 text-center">
              동행 의사를 확실히 하기 위해 참여를 확정해주세요
            </p>
          </div>
        )}
      </header>

      {/* 채팅 메시지 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.user_id === user.id ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-xs ${message.user_id === user.id ? 'ml-4' : 'mr-4'}`}>
              {message.user_id !== user.id && (
                <p className="text-xs text-gray-500 mb-1 px-1">
                  {message.user?.nickname} ({message.user?.department})
                </p>
              )}
              <div
                className={`chat-message ${
                  message.user_id === user.id ? 'chat-message-own' : 'chat-message-other'
                }`}
              >
                {message.content}
              </div>
              <p className="text-xs text-gray-400 mt-1 px-1">
                {format(new Date(message.created_at), 'HH:mm')}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 메시지 입력 영역 */}
      {isParticipant ? (
        <div className="bg-white border-t border-gray-100 p-4">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="메시지를 입력하세요..."
              className="flex-1 px-4 py-2 border border-gray-200 rounded-full focus:border-primary-600 focus:ring-2 focus:ring-primary-100"
            />
            <button
              onClick={handleSendMessage}
              disabled={!newMessage.trim()}
              className="p-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white rounded-full"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex justify-center mt-4">
            <button
              onClick={handleLeaveRoom}
              className="text-sm text-red-600 hover:text-red-700"
            >
              채팅방 나가기
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border-t border-gray-100 p-4 text-center">
          <p className="text-gray-600 text-sm">
            채팅방에 참여해야 메시지를 보낼 수 있습니다
          </p>
        </div>
      )}

      {/* 신고 모달 */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
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
