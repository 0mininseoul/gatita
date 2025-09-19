'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ChatRoom, User, LocationType, LOCATIONS, RoomParticipant } from '@/lib/supabase'
import { ArrowLeft, Users, Clock, Plus, ChevronDown, Star } from 'lucide-react'
import { format, isAfter, isSameDay, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import toast from 'react-hot-toast'

function RoomsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<User | null>(null)
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const supabase = createClient()

  const fromLocation = searchParams.get('from') as LocationType
  const toLocation = searchParams.get('to') as LocationType

  useEffect(() => {
    if (!fromLocation || !toLocation) {
      router.push('/')
      return
    }
    
    checkAuthAndLoadData()
  }, [fromLocation, toLocation, selectedDate])

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
        await loadRooms(userData.id)
      }
    } catch (error) {
      console.error('Auth/data loading error:', error)
      router.push('/')
    } finally {
      setLoading(false)
    }
  }

  const loadRooms = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('chat_rooms')
        .select(`
          *,
          creator:created_by(nickname, department),
          participants:room_participants(
            id,
            user_id,
            confirmed,
            user:users(nickname, department)
          )
        `)
        .eq('from_location', fromLocation)
        .eq('to_location', toLocation)
        .eq('departure_date', selectedDate)
        .eq('status', 'active')
        .order('departure_time', { ascending: true })

      if (data) {
        setRooms(data as any)
      }
    } catch (error) {
      console.error('Load rooms error:', error)
    }
  }

  const addToFavorites = async () => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('favorites')
        .insert({
          user_id: user.id,
          from_location: fromLocation,
          to_location: toLocation
        })

      if (error && !error.message.includes('duplicate')) {
        throw error
      }

      toast.success('즐겨찾기에 추가되었습니다!')
    } catch (error: any) {
      if (error.message.includes('duplicate')) {
        toast.success('이미 즐겨찾기에 있는 경로입니다')
      } else {
        toast.error('즐겨찾기 추가 중 오류가 발생했습니다')
      }
    }
  }

  const getDateOptions = () => {
    const dates = []
    const today = new Date()
    
    // 어제, 오늘, 내일만 표시
    for (let i = -1; i <= 1; i++) {
      const date = new Date()
      date.setDate(today.getDate() + i)
      dates.push({
        value: format(date, 'yyyy-MM-dd'),
        label: i === 0 ? '오늘' : 
               i === 1 ? '내일' : 
               '어제'
      })
    }
    
    return dates
  }

  const separateRooms = (rooms: ChatRoom[]) => {
    const now = new Date()
    const currentTime = format(now, 'HH:mm')
    const isToday = selectedDate === format(now, 'yyyy-MM-dd')
    
    const myRooms: ChatRoom[] = []
    const futureRooms: ChatRoom[] = []
    const pastRooms: ChatRoom[] = []

    rooms.forEach(room => {
      const isParticipant = room.participants?.some(p => p.user_id === user?.id)
      
      if (isParticipant) {
        myRooms.push(room)
      } else if (isToday && room.departure_time < currentTime) {
        pastRooms.push(room)
      } else {
        futureRooms.push(room)
      }
    })

    return { myRooms, futureRooms, pastRooms }
  }

  const handleJoinRoom = async (roomId: string) => {
    if (!user) return

    try {
      const room = rooms.find(r => r.id === roomId)
      if (!room) return

      const currentParticipants = room.participants?.length || 0
      if (currentParticipants >= room.max_participants) {
        toast.error('채팅방이 가득 찼습니다')
        return
      }

      const { error } = await supabase
        .from('room_participants')
        .insert({
          room_id: roomId,
          user_id: user.id,
          confirmed: false
        })

      if (error) {
        if (error.message.includes('duplicate')) {
          toast.error('이미 참여 중인 채팅방입니다')
        } else {
          throw error
        }
        return
      }

      router.push(`/rooms/${roomId}`)
    } catch (error) {
      console.error('Join room error:', error)
      toast.error('채팅방 참여 중 오류가 발생했습니다')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-spinner" />
      </div>
    )
  }

  const { myRooms, futureRooms, pastRooms } = separateRooms(rooms)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
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
                {LOCATIONS[fromLocation]} → {LOCATIONS[toLocation]}
              </h1>
              <p className="text-sm text-gray-600">동행자 찾기</p>
            </div>
          </div>
          <button
            onClick={addToFavorites}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <Star className="w-5 h-5 text-yellow-500" />
          </button>
        </div>

        {/* 날짜 선택 */}
        <div className="mt-4">
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="input-field text-sm"
          >
            {getDateOptions().map(date => (
              <option key={date.value} value={date.value}>
                {date.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* 내가 참여 중인 채팅방 */}
        {myRooms.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              참여 중인 채팅방
            </h2>
            <div className="space-y-3">
              {myRooms.map(room => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onJoin={() => router.push(`/rooms/${room.id}`)}
                  isParticipant={true}
                  showJoinButton={false}
                />
              ))}
            </div>
          </section>
        )}

        {/* 미래 출발 채팅방 */}
        {futureRooms.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              예정된 채팅방
            </h2>
            <div className="space-y-3">
              {futureRooms.map(room => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onJoin={() => handleJoinRoom(room.id)}
                  isParticipant={false}
                  showJoinButton={true}
                />
              ))}
            </div>
          </section>
        )}

        {/* 과거 출발 채팅방 */}
        {pastRooms.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              출발한 채팅방
            </h2>
            <div className="space-y-3">
              {pastRooms.map(room => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onJoin={() => {}}
                  isParticipant={false}
                  showJoinButton={false}
                  isPast={true}
                />
              ))}
            </div>
          </section>
        )}

        {/* 채팅방이 없을 때 */}
        {rooms.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              아직 채팅방이 없어요
            </h3>
            <p className="text-gray-600 mb-6">
              새로운 채팅방을 만들어 동행자를 모집해보세요
            </p>
            <button
              onClick={() => setIsCreatingRoom(true)}
              className="btn-primary"
            >
              <Plus className="w-5 h-5 mr-2" />
              채팅방 만들기
            </button>
          </div>
        )}

        {/* 플로팅 버튼 */}
        <button
          onClick={() => setIsCreatingRoom(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg flex items-center justify-center z-20"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* 채팅방 생성 모달 */}
      {isCreatingRoom && (
        <CreateRoomModal
          fromLocation={fromLocation}
          toLocation={toLocation}
          selectedDate={selectedDate}
          user={user}
          onClose={() => setIsCreatingRoom(false)}
          onSuccess={(roomId) => {
            setIsCreatingRoom(false)
            router.push(`/rooms/${roomId}`)
          }}
        />
      )}
    </div>
  )
}

// Room Card Component
interface RoomCardProps {
  room: ChatRoom
  onJoin: () => void
  isParticipant: boolean
  showJoinButton: boolean
  isPast?: boolean
}

function RoomCard({ room, onJoin, isParticipant, showJoinButton, isPast }: RoomCardProps) {
  const participantCount = room.participants?.length || 0
  
  return (
    <div className={`card p-4 ${isParticipant ? 'ring-2 ring-primary-200 bg-primary-50' : ''} ${isPast ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <Clock className="w-4 h-4 text-gray-500 mr-2" />
          <span className="font-semibold text-lg">{room.departure_time}</span>
          {isPast && <span className="ml-2 text-xs text-gray-500">(출발함)</span>}
        </div>
        <div className="flex items-center text-sm text-gray-600">
          <Users className="w-4 h-4 mr-1" />
          {participantCount}/{room.max_participants}
        </div>
      </div>

      <div className="mb-3">
        <p className="text-sm text-gray-600">
          개설자: {room.creator?.nickname} ({room.creator?.department})
        </p>
        {room.participants && room.participants.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-gray-500 mb-1">참여자:</p>
            <div className="flex flex-wrap gap-1">
              {room.participants.map(participant => (
                <span
                  key={participant.id}
                  className="inline-block px-2 py-1 bg-gray-100 rounded-md text-xs"
                >
                  {participant.user?.nickname}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {showJoinButton && (
        <button
          onClick={onJoin}
          disabled={participantCount >= room.max_participants}
          className={`w-full py-2 px-4 rounded-lg font-medium text-sm transition-colors ${
            participantCount >= room.max_participants
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-primary-600 hover:bg-primary-700 text-white'
          }`}
        >
          {participantCount >= room.max_participants ? '채팅방이 가득참' : '참여하기'}
        </button>
      )}

      {isParticipant && (
        <button
          onClick={onJoin}
          className="w-full py-2 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium text-sm"
        >
          채팅방 입장
        </button>
      )}
    </div>
  )
}

// Create Room Modal Component
interface CreateRoomModalProps {
  fromLocation: LocationType
  toLocation: LocationType
  selectedDate: string
  user: User | null
  onClose: () => void
  onSuccess: (roomId: string) => void
}

function CreateRoomModal({ fromLocation, toLocation, selectedDate, user, onClose, onSuccess }: CreateRoomModalProps) {
  const [departureTime, setDepartureTime] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()

  const handleCreateRoom = async () => {
    if (!departureTime || !user) return

    setIsLoading(true)
    
    try {
      const title = `${departureTime} ${LOCATIONS[fromLocation]}→${LOCATIONS[toLocation]}`
      
      const { data: room, error } = await supabase
        .from('chat_rooms')
        .insert({
          title,
          from_location: fromLocation,
          to_location: toLocation,
          departure_date: selectedDate,
          departure_time: departureTime,
          max_participants: 4, // 고정값
          created_by: user.id
        })
        .select()
        .single()

      if (error) throw error

      // 자동으로 방장을 참여자로 추가
      const { error: participantError } = await supabase
        .from('room_participants')
        .insert({
          room_id: room.id,
          user_id: user.id,
          confirmed: true
        })

      if (participantError) throw participantError

      toast.success('채팅방이 생성되었습니다!')
      onSuccess(room.id)
    } catch (error) {
      console.error('Create room error:', error)
      toast.error('채팅방 생성 중 오류가 발생했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">새 채팅방 만들기</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                출발 시간
              </label>
              <input
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="input-field"
              />
            </div>

            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-sm text-gray-600">
                <strong>최대 인원:</strong> 4명 (고정)
              </p>
              <p className="text-xs text-gray-500 mt-1">
                방장 포함 최대 4명까지 참여 가능합니다
              </p>
            </div>
          </div>

          <div className="flex space-x-3 mt-6">
            <button
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              취소
            </button>
            <button
              onClick={handleCreateRoom}
              disabled={!departureTime || isLoading}
              className="btn-primary flex-1"
            >
              {isLoading ? '생성 중...' : '만들기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RoomsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-spinner" />
      </div>
    }>
      <RoomsPageContent />
    </Suspense>
  )
}
