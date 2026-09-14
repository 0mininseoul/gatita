import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type ChangeDeparturePayload = {
  departure_time?: string
}

// 창(KST) 판정, 방장 검증, 쿨다운, title 갱신, 확정 해제는 모두
// change_room_departure_time RPC 안에서 한 트랜잭션으로 처리한다. 서버 런타임이 UTC 라
// 창 판정을 여기서 하면 9시간 어긋나고, 방 생성(create_room_with_participant)과도
// 규칙이 갈린다.
const SAFE_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  room_not_found: {
    status: 404,
    code: 'room_not_found',
    message: '채팅방을 찾을 수 없습니다',
  },
  host_only: {
    status: 403,
    code: 'host_only',
    message: '방장만 출발 시간을 바꿀 수 있어요',
  },
  room_already_departed: {
    status: 409,
    code: 'room_already_departed',
    message: '출발 시각이 지나 시간을 바꿀 수 없어요',
  },
  departure_change_rate_limited: {
    status: 429,
    code: 'departure_change_rate_limited',
    message: '방금 바꿨어요. 잠시 후 다시 시도해주세요',
  },
  departure_time_out_of_window: {
    status: 409,
    code: 'departure_time_out_of_window',
    message: '오늘 고를 수 있는 시간대 밖이에요',
  },
  invalid_room_payload: {
    status: 400,
    code: 'invalid_room_payload',
    message: '출발 시간이 올바르지 않습니다',
  },
}

function getSafeDepartureChangeError(error: { code?: string; message?: string }) {
  if (error.code === '23505') {
    return {
      status: 409,
      code: 'duplicate_active_room',
      message: '그 시간엔 같은 경로 방이 이미 있어요',
    }
  }

  return error.message ? SAFE_ERRORS[error.message] : undefined
}

async function changeRoomDeparture(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()

  if (authError || !data.user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const payload = await request.json().catch(() => null) as ChangeDeparturePayload | null

  if (!payload || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(payload.departure_time ?? '')) {
    return NextResponse.json({ error: '출발 시간이 올바르지 않습니다' }, { status: 400 })
  }

  const { data: result, error } = await supabase.rpc('change_room_departure_time', {
    p_room_id: params.id,
    p_departure_time: payload.departure_time,
  })

  if (error) {
    const safeError = getSafeDepartureChangeError(error)
    if (safeError) {
      return NextResponse.json(
        { error: safeError.message, code: safeError.code },
        { status: safeError.status },
      )
    }

    console.error('Change room departure RPC error:', error)
    return NextResponse.json({ error: '출발 시간을 바꾸지 못했습니다' }, { status: 500 })
  }

  return NextResponse.json({
    room: result?.room ?? null,
    unchanged: Boolean(result?.unchanged),
    confirmationsReset: Boolean(result?.confirmations_reset),
    shiftMinutes: Number(result?.shift_minutes ?? 0),
  })
}

export const PATCH = withAxiomRoute(changeRoomDeparture)
