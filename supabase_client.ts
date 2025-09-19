import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const createClient = () => {
  return createClientComponentClient()
}

export const createServerClient = () => {
  return createServerComponentClient({ cookies })
}

// Types for our database
export type User = {
  id: string
  email: string
  name: string
  phone: string
  nickname: string
  nickname_updated_at?: string
  department: string
  status: 'active' | 'suspended'
  is_admin: boolean
  created_at: string
  updated_at: string
}

export type ChatRoom = {
  id: string
  title: string
  from_location: LocationType
  to_location: LocationType
  departure_date: string
  departure_time: string
  max_participants: number
  created_by: string
  status: 'active' | 'closed'
  created_at: string
  participants?: RoomParticipant[]
  creator?: User
}

export type RoomParticipant = {
  id: string
  room_id: string
  user_id: string
  confirmed: boolean
  joined_at: string
  user?: User
}

export type Message = {
  id: string
  room_id: string
  user_id: string
  content: string
  created_at: string
  user?: User
}

export type Report = {
  id: string
  room_id?: string
  reporter_id: string
  reported_id: string
  reason: string
  status: 'pending' | 'reviewed' | 'resolved'
  created_at: string
  reporter?: User
  reported?: User
  room?: ChatRoom
}

export type Favorite = {
  id: string
  user_id: string
  from_location: LocationType
  to_location: LocationType
  created_at: string
}

export type LocationType = 
  | '가천대역_1번출구'
  | '가천대학교_정문' 
  | '교육대학원'
  | 'AI공학관'

// Location display names
export const LOCATIONS: Record<LocationType, string> = {
  '가천대역_1번출구': '가천대역 1번출구',
  '가천대학교_정문': '가천대학교 정문',
  '교육대학원': '교육대학원',
  'AI공학관': 'AI공학관'
}

// Department options
export const DEPARTMENTS = [
  'AI·소프트웨어학부',
  '컴퓨터공학과',
  '전자공학과',
  '기계공학과',
  '건축공학과',
  '화공생명공학과',
  '환경공학과',
  '토목환경공학과',
  '산업경영공학과',
  '경영학과',
  '국제통상학과',
  '관광경영학과',
  '경제학과',
  '사회복지학과',
  '행정학과',
  '법학과',
  '영어영문학과',
  '일본학과',
  '중국학과',
  '한국어문학과',
  '사학과',
  '철학과',
  '의학과',
  '간호학과',
  '약학과',
  '식품영양학과',
  '운동재활복지학과',
  '기타'
]