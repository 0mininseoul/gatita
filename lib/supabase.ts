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
export type PublicProfile = {
  id: string
  nickname: string
  nickname_updated_at?: string | null
  department: string
  avatar_url?: string | null
  created_at: string
  updated_at: string
}

export type PrivateProfile = {
  user_id: string
  email: string
  name: string
  phone: string
  phone_verified_at?: string | null
  phone_mfa_factor_id?: string | null
  status: 'active' | 'suspended'
  suspended_until?: string | null
  suspension_reason?: string | null
  moderation_updated_at?: string | null
  is_admin: boolean
  created_at: string
  updated_at: string
}

export type User = PublicProfile & Omit<PrivateProfile, 'user_id'>

export type PayoutAccount = {
  user_id: string
  bank_name: string
  account_number: string
  account_holder: string
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
  creatorPayoutAccount?: PayoutAccount | null
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
  resolution_action?: 'no_action' | 'warning' | 'suspend_7d' | 'suspend_30d' | 'suspend_permanent' | null
  resolution_note?: string | null
  resolved_by?: string | null
  resolved_at?: string | null
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
  | '중앙도서관'

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
  'AI공학관': 'AI공학관',
  '중앙도서관': '중앙도서관'
}

export const LOCATION_ORDER: LocationType[] = [
  '가천대역_1번출구',
  '가천대학교_정문',
  '교육대학원',
  '중앙도서관',
  'AI공학관',
  '제2기숙사'
]

export const ROUTE_TOO_CLOSE_MESSAGE = '너무 가까워서 선택할 수 없습니다'

const restrictedRoutePairs = new Set([
  '가천대역_1번출구__가천대학교_정문',
  '가천대학교_정문__가천대역_1번출구',
  '제2기숙사__AI공학관',
  'AI공학관__제2기숙사',
  '교육대학원__중앙도서관',
  '중앙도서관__교육대학원'
])

export function isRestrictedRoutePair(fromLocation: LocationType | '', toLocation: LocationType | '') {
  if (!fromLocation || !toLocation) return false
  return restrictedRoutePairs.has(`${fromLocation}__${toLocation}`)
}

export function getDestinationOptions(fromLocation: LocationType | '') {
  if (!fromLocation) return LOCATION_ORDER

  return LOCATION_ORDER.filter(
    (location) => location !== fromLocation && !isRestrictedRoutePair(fromLocation, location)
  )
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// The earliest selectable departure minute: the first whole minute that is at
// least one full minute after `now`. Rounding only to the next minute boundary
// would allow an option barely seconds in the future (e.g. at 19:25:59 the next
// boundary 19:26 is 1s away), which then races past `now` during submission.
// Requiring a full-minute lead keeps every offered time comfortably in the future.
const MIN_DEPARTURE_LEAD_MS = 60_000

function getEarliestDepartureMinute(now: Date) {
  const earliest = new Date(now)
  earliest.setSeconds(0, 0)
  earliest.setMinutes(earliest.getMinutes() + 1)
  if (earliest.getTime() - now.getTime() < MIN_DEPARTURE_LEAD_MS) {
    earliest.setMinutes(earliest.getMinutes() + 1)
  }
  return earliest
}

export function getDepartureTimeOptions(now = new Date(), intervalMinutes = 1) {
  const options: string[] = []
  const nextTime = getEarliestDepartureMinute(now)

  // Snap up to the next interval boundary (a no-op when intervalMinutes === 1).
  const remainder = nextTime.getMinutes() % intervalMinutes
  if (remainder !== 0) {
    nextTime.setMinutes(nextTime.getMinutes() + (intervalMinutes - remainder), 0, 0)
  }

  const cutoff = new Date(nextTime)
  cutoff.setHours(1, 0, 0, 0)
  if (nextTime > cutoff) {
    cutoff.setDate(cutoff.getDate() + 1)
  }

  while (nextTime <= cutoff) {
    const hours = String(nextTime.getHours()).padStart(2, '0')
    const minutes = String(nextTime.getMinutes()).padStart(2, '0')
    options.push(`${hours}:${minutes}`)
    nextTime.setMinutes(nextTime.getMinutes() + intervalMinutes)
  }

  return options
}

// Resolves the concrete calendar date for a selected HH:MM, using the exact same
// window as getDepartureTimeOptions: [earliest departure minute, the upcoming 01:00].
// Returns null when the time falls outside that window (e.g. a stale option that
// was selected while the form was open and only submitted after it had passed),
// so callers never silently roll a same-day evening time over to the next evening.
export function getDepartureDateForTime(now: Date, departureTime: string): string | null {
  const [hours, minutes] = departureTime.split(':').map(Number)
  // isFinite (not isNaN) also rejects a malformed time whose minute is undefined,
  // e.g. "19" → [19, undefined], which would otherwise yield an Invalid Date.
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null

  // Shares getDepartureTimeOptions' first offered minute so the two never disagree.
  const windowStart = getEarliestDepartureMinute(now)

  // cutoff is the upcoming 01:00 (today's if we are still before it, else tomorrow's).
  const cutoff = new Date(windowStart)
  cutoff.setHours(1, 0, 0, 0)
  if (windowStart > cutoff) {
    cutoff.setDate(cutoff.getDate() + 1)
  }

  const candidate = new Date(windowStart)
  candidate.setHours(hours, minutes, 0, 0)
  // A time-of-day earlier than the window start belongs to the following day
  // (the post-midnight portion of the window).
  if (candidate < windowStart) {
    candidate.setDate(candidate.getDate() + 1)
  }

  if (candidate < windowStart || candidate > cutoff) {
    return null
  }

  return formatLocalDate(candidate)
}

export function getMapRoomDateRange(now = new Date()) {
  const today = new Date(now)
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  return [formatLocalDate(today), formatLocalDate(tomorrow)]
}

export const ROOM_MAP_VISIBILITY_WINDOW_MINUTES = 30

export function getRoomDepartureDateTime(departureDate: string, departureTime: string) {
  return new Date(`${departureDate}T${departureTime.slice(0, 5)}:00+09:00`)
}

export function isRoomJoinable(departureDate: string, departureTime: string, now = new Date()) {
  return getRoomDepartureDateTime(departureDate, departureTime).getTime() >= now.getTime()
}

export function isRoomVisibleOnMap(departureDate: string, departureTime: string, now = new Date()) {
  const visibleUntil = getRoomDepartureDateTime(departureDate, departureTime).getTime()
    + ROOM_MAP_VISIBILITY_WINDOW_MINUTES * 60 * 1000

  return visibleUntil >= now.getTime()
}

export const LOCATION_POINTS: Record<LocationType, LocationPoint> = {
  '가천대역_1번출구': {
    id: '가천대역_1번출구',
    label: '가천대역 1번출구',
    shortLabel: '1번출구',
    description: '가천대역 1번 출구 앞 인도',
    lat: 37.4495735,
    lng: 127.1268578,
    mapX: 19.5,
    mapY: 78.2
  },
  '가천대학교_정문': {
    id: '가천대학교_정문',
    label: '가천대학교 정문',
    shortLabel: '정문',
    description: '비전타워 북측 진입로',
    lat: 37.45031,
    lng: 127.12772,
    mapX: 26.9,
    mapY: 70.4
  },
  '교육대학원': {
    id: '교육대학원',
    label: '교육대학원',
    shortLabel: '교육대학원',
    description: '교육대학원 건물',
    lat: 37.451908340075576,
    lng: 127.13179212698977,
    mapX: 62,
    mapY: 53.6
  },
  '제3기숙사': {
    id: '제3기숙사',
    label: '제3기숙사',
    shortLabel: '제3기숙사',
    description: '학생생활관 북동측',
    lat: 37.45638,
    lng: 127.13505,
    mapX: 90.1,
    mapY: 6.5
  },
  '제2기숙사': {
    id: '제2기숙사',
    label: '제2기숙사',
    shortLabel: '제2기숙사',
    description: '학생생활관 서측',
    lat: 37.45605,
    lng: 127.13452,
    mapX: 85.5,
    mapY: 10
  },
  'AI공학관': {
    id: 'AI공학관',
    label: 'AI공학관',
    shortLabel: 'AI공학관',
    description: 'AI관 건물',
    lat: 37.455155,
    lng: 127.133488,
    mapX: 76.6,
    mapY: 19.4
  },
  '중앙도서관': {
    id: '중앙도서관',
    label: '중앙도서관',
    shortLabel: '중앙도서관',
    description: '중앙도서관 건물',
    lat: 37.45234386757405,
    lng: 127.13309824619479,
    mapX: 73.3,
    mapY: 49
  }
}

export const GACHON_GLOBAL_CAMPUS_CENTER = {
  lat: 37.4531,
  lng: 127.1319
}

export const GACHON_GLOBAL_CAMPUS_BOUNDS = {
  south: 37.4475,
  west: 127.1246,
  north: 37.4582,
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
