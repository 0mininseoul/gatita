import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { LOCATION_ORDER, type LocationType } from '@/lib/supabase'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type RoomCreationSource = 'standard' | 'dormitory_request'

type CreateRoomPayload = {
  from_location?: string
  to_location?: string
  departure_date?: string
  departure_time?: string
  creation_source?: string
}

const SAFE_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  invalid_route: {
    status: 400,
    code: 'invalid_route',
    message: '출발지와 도착지를 다시 확인해주세요',
  },
  invalid_dormitory_request_route: {
    status: 400,
    code: 'invalid_dormitory_request_route',
    message: '동행 요청 경로가 올바르지 않습니다',
  },
  invalid_creation_source: {
    status: 400,
    code: 'invalid_creation_source',
    message: '방 생성 방식이 올바르지 않습니다',
  },
  profile_required: {
    status: 403,
    code: 'profile_required',
    message: '프로필 설정이 필요합니다',
  },
  account_suspended: {
    status: 403,
    code: 'account_suspended',
    message: '서비스 이용이 정지된 계정입니다',
  },
  departure_time_out_of_window: {
    status: 409,
    code: 'departure_time_out_of_window',
    message: '출발 가능 시간이 지났어요. 시간을 다시 선택해주세요',
  },
  dormitory_request_supply_available: {
    status: 409,
    code: 'dormitory_request_supply_available',
    message: '입장할 수 있는 방이 이미 있어요',
  },
  dormitory_request_rate_limited: {
    status: 429,
    code: 'dormitory_request_rate_limited',
    message: '동행 요청은 5분 후에 다시 보낼 수 있어요',
  },
}

function isLocationType(value: unknown): value is LocationType {
  return typeof value === 'string' && LOCATION_ORDER.includes(value as LocationType)
}

function isCreationSource(value: unknown): value is RoomCreationSource {
  return value === 'standard' || value === 'dormitory_request'
}

function getSafeRoomCreationError(error: { code?: string; message?: string }) {
  if (error.code === '23505') {
    return {
      status: 409,
      code: 'duplicate_active_room',
      message: '같은 시간과 경로의 방이 이미 있어요',
    }
  }

  return error.message ? SAFE_ERRORS[error.message] : undefined
}

async function createRoom(request: Request) {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()

  if (authError || !data.user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const payload = await request.json().catch(() => null) as CreateRoomPayload | null
  const creationSource = payload?.creation_source ?? 'standard'

  if (
    !payload
    || !isLocationType(payload.from_location)
    || !isLocationType(payload.to_location)
    || !/^\d{4}-\d{2}-\d{2}$/.test(payload.departure_date ?? '')
    || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(payload.departure_time ?? '')
    || !isCreationSource(creationSource)
  ) {
    return NextResponse.json({ error: '채팅방 정보가 올바르지 않습니다' }, { status: 400 })
  }

  const { data: room, error } = await supabase.rpc('create_room_with_participant', {
    p_from_location: payload.from_location,
    p_to_location: payload.to_location,
    p_departure_date: payload.departure_date,
    p_departure_time: payload.departure_time,
    p_creation_source: creationSource,
  })

  if (error) {
    const safeError = getSafeRoomCreationError(error)
    if (safeError) {
      return NextResponse.json(
        { error: safeError.message, code: safeError.code },
        { status: safeError.status },
      )
    }

    console.error('Create room RPC error:', error)
    return NextResponse.json({ error: '채팅방을 만들지 못했습니다' }, { status: 500 })
  }

  return NextResponse.json({ room })
}

export const POST = withAxiomRoute(createRoom)
