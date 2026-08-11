import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type LeaveRoomPayload = {
  nextHostId?: string | null
  boarded?: boolean | null
}

// 출발시각(KST) 이 지났는지 판정. lib/supabase getRoomDepartureDateTime 과 동일 규칙.
function isAfterDeparture(departureDate: string, departureTime: string) {
  const departedAt = new Date(`${departureDate}T${departureTime.slice(0, 5)}:00+09:00`).getTime()
  return Number.isFinite(departedAt) && departedAt <= Date.now()
}

async function leaveRoom(
  request: Request,
  { params }: { params: { id: string } },
) {
  const roomId = params.id

  let payload: LeaveRoomPayload = {}

  try {
    payload = await request.json()
  } catch {
    payload = {}
  }

  const nextHostId = payload.nextHostId ?? ''
  const boarded = typeof payload.boarded === 'boolean' ? payload.boarded : null
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const user = data.user

  if (authError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const admin = createAdminSupabase()

  const { data: room, error: roomError } = await admin
    .from('chat_rooms')
    .select('id, created_by, status, departure_date, departure_time')
    .eq('id', roomId)
    .eq('status', 'active')
    .maybeSingle()

  if (roomError) {
    return NextResponse.json({ error: '채팅방 정보를 확인하지 못했습니다' }, { status: 500 })
  }

  if (!room) {
    return NextResponse.json({ error: '채팅방을 찾을 수 없습니다' }, { status: 404 })
  }

  const { data: participants, error: participantsError } = await admin
    .from('room_participants')
    .select('id, user_id')
    .eq('room_id', roomId)

  if (participantsError) {
    return NextResponse.json({ error: '참여자 정보를 확인하지 못했습니다' }, { status: 500 })
  }

  const currentParticipants = participants ?? []
  const isParticipant = currentParticipants.some((participant) => participant.user_id === user.id)

  if (!isParticipant) {
    return NextResponse.json({ error: '채팅방 참여자만 나갈 수 있습니다' }, { status: 403 })
  }

  const isRoomCreator = room.created_by === user.id

  if (isRoomCreator && currentParticipants.length >= 2) {
    const isValidNextHost = currentParticipants.some(
      (participant) => participant.user_id === nextHostId && participant.user_id !== user.id,
    )

    if (!isValidNextHost) {
      return NextResponse.json({ error: '다음 방장을 선택해주세요' }, { status: 400 })
    }

    const { error: transferError } = await admin
      .from('chat_rooms')
      .update({ created_by: nextHostId })
      .eq('id', roomId)
      .eq('created_by', user.id)

    if (transferError) {
      return NextResponse.json({ error: '다음 방장에게 권한을 넘기지 못했습니다' }, { status: 500 })
    }
  } else if (nextHostId) {
    return NextResponse.json({ error: '방장만 다음 방장을 지정할 수 있습니다' }, { status: 403 })
  }

  // 출발시각 이후 나가기라면 "택시 탑승을 완료하셨나요?" 응답(예/아니오)을 기록.
  // 기록 실패가 나가기 자체를 막지는 않는다.
  if (boarded !== null && isAfterDeparture(room.departure_date, room.departure_time)) {
    const { error: rideError } = await admin
      .from('ride_completions')
      .upsert(
        { room_id: roomId, user_id: user.id, boarded, answered_at: new Date().toISOString() },
        { onConflict: 'room_id,user_id' },
      )

    if (rideError) {
      console.error('ride completion record error:', rideError)
    }
  }

  const { error: leaveError } = await admin
    .from('room_participants')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', user.id)

  if (leaveError) {
    return NextResponse.json({ error: '채팅방을 나가지 못했습니다' }, { status: 500 })
  }

  // 나갔다는 사실을 이력에 남긴다. room_participants 행은 위에서 삭제되었다.
  // 이벤트 로그이므로 갱신이 아니라 새 'left' 행을 추가한다.
  const { error: historyError } = await admin
    .from('room_participant_events')
    .insert({ room_id: roomId, user_id: user.id, event_type: 'left' })

  if (historyError) {
    console.error('participation history leave error:', historyError)
  }

  // 마지막 한 명이 나가면 방을 닫는다. 이 순간을 노려 띄우던 구독 유도 프롬프트는
  // 성가시다는 피드백으로 제거됐다(followup 스펙 11번) — 지금은 상태 전환만 한다.
  if (currentParticipants.length <= 1) {
    await admin
      .from('chat_rooms')
      .update({ status: 'closed' })
      .eq('id', roomId)
  }

  return NextResponse.json({ ok: true })
}

export const POST = withAxiomRoute(leaveRoom)
