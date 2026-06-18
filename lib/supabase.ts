import { createBrowserClient } from '@supabase/ssr'

// 환경 변수 유효성 검사 (한 번만 수행)
let envValidated = false
let validationError: string | null = null

const validateEnv = () => {
  if (envValidated) {
    if (validationError) throw new Error(validationError)
    return
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    validationError = 'Supabase 환경 변수가 설정되지 않았습니다. .env.local 파일을 확인해주세요.\n' +
                     `URL: ${supabaseUrl ? 'SET' : 'NOT SET'}\n` +
                     `Key: ${supabaseAnonKey ? 'SET' : 'NOT SET'}`

    console.error('Supabase 환경 변수 누락')
    console.error(validationError)
    envValidated = true
    throw new Error(validationError)
  }

  envValidated = true
}

export const createClient = () => {
  validateEnv()

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
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
  | '제3기숙사'
  | '제2기숙사'
  | 'AI공학관'

export type LocationPoint = {
  id: LocationType
  label: string
  shortLabel: string
  description: string
  lat: number
  lng: number
  mapX: number
  mapY: number
}

// Location display names
export const LOCATIONS: Record<LocationType, string> = {
  '가천대역_1번출구': '가천대역 1번출구',
  '가천대학교_정문': '가천대학교 정문',
  '교육대학원': '교육대학원',
  '제3기숙사': '제3기숙사',
  '제2기숙사': '제2기숙사',
  'AI공학관': 'AI공학관'
}

export const LOCATION_ORDER: LocationType[] = [
  '가천대역_1번출구',
  '가천대학교_정문',
  '교육대학원',
  'AI공학관',
  '제3기숙사',
  '제2기숙사'
]

export const LOCATION_POINTS: Record<LocationType, LocationPoint> = {
  '가천대역_1번출구': {
    id: '가천대역_1번출구',
    label: '가천대역 1번출구',
    shortLabel: '가천대역',
    description: '역 출구 앞',
    lat: 37.451237,
    lng: 127.129389,
    mapX: 16,
    mapY: 55
  },
  '가천대학교_정문': {
    id: '가천대학교_정문',
    label: '가천대학교 정문',
    shortLabel: '정문',
    description: '글로벌캠퍼스 진입 지점',
    lat: 37.45112,
    lng: 127.13092,
    mapX: 33,
    mapY: 50
  },
  '교육대학원': {
    id: '교육대학원',
    label: '교육대학원',
    shortLabel: '교육대학원',
    description: '캠퍼스 중앙 남측',
    lat: 37.45013,
    lng: 127.13218,
    mapX: 57,
    mapY: 68
  },
  '제3기숙사': {
    id: '제3기숙사',
    label: '제3기숙사',
    shortLabel: '제3기숙사',
    description: '기숙사 북측',
    lat: 37.45227,
    lng: 127.13318,
    mapX: 76,
    mapY: 29
  },
  '제2기숙사': {
    id: '제2기숙사',
    label: '제2기숙사',
    shortLabel: '제2기숙사',
    description: '기숙사 남측',
    lat: 37.44942,
    lng: 127.13368,
    mapX: 79,
    mapY: 80
  },
  'AI공학관': {
    id: 'AI공학관',
    label: 'AI공학관',
    shortLabel: 'AI공학관',
    description: 'AI·공학관 인근',
    lat: 37.45142,
    lng: 127.13242,
    mapX: 61,
    mapY: 46
  }
}

export const GACHON_GLOBAL_CAMPUS_CENTER = {
  lat: 37.45085,
  lng: 127.13135
}

export const GACHON_GLOBAL_CAMPUS_BOUNDS = {
  south: 37.4478,
  west: 127.1246,
  north: 37.4539,
  east: 127.1362
}

// Department options
export const DEPARTMENTS = [
  '경영학과',
  '글로벌경영학과',
  '금융수학과',
  '미디어커뮤니케이션학과',
  '관광경영학과',
  '경제학과',
  '의료산업경영학과',
  '응용통계학과',
  '사회복지학과',
  '유아교육학과',
  '심리학과',
  '한국어문학과',
  '영미어문학과',
  '동양어문학과',
  '유럽어문학과',
  '법학과',
  '경찰행정학과',
  '행정학과',
  '도시계획·조경학부',
  '건축학부',
  '설비·소방공학과',
  '화공생명공학과',
  '기계공학과',
  '산업경영공학과',
  '토목환경공학과',
  '신소재공학과',
  '스마트팩토리학과',
  '미래자동차학과',
  '바이오나노학과',
  '화학과',
  '물리학과',
  '생명과학과',
  '식품생물공학과',
  '식품영양학과',
  '전자공학과',
  '반도체공학과',
  '차세대반도체설계학과',
  '반도체디스플레이학과',
  '반도체설계학과',
  'AI·소프트웨어학부',
  '컴퓨터공학과',
  '전기공학과',
  '에너지IT학과',
  '의공학과',
  '스마트시티학과',
  '스마트보안학과',
  '클라우드공학과',
  '게임·영상학과',
  '바이오의료기기학과',
  '한의예과',
  '한의학과',
  '미술·디자인학부',
  '음악학부',
  '체육학부',
  '운동재활학과',
  '연기예술학과',
  '기타'
]
