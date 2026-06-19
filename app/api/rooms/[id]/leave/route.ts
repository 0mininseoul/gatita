import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createClient } from '@/lib/supabase/server'

type LeaveRoomPayload = {
  nextHostId?: string | null
}

async function leaveRoom(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const roomId = params.id

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: '채팅방 나가기 설정이 아직 연결되지 않았습니다' },
      { status: 500 },
    )
  }

  let payload: LeaveRoomPayload = {}

  try {
    payload = await request.json()
  } catch {
    payload = {}
  }

  const nextHostId = payload.nextHostId ?? ''
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const user = data.user

  if (authError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { data: room, error: roomError } = await admin
    .from('chat_rooms')
    .select('id, created_by, status')
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

  const { error: leaveError } = await admin
    .from('room_participants')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', user.id)

  if (leaveError) {
    return NextResponse.json({ error: '채팅방을 나가지 못했습니다' }, { status: 500 })
  }

  if (currentParticipants.length <= 1) {
    await admin
      .from('chat_rooms')
      .update({ status: 'closed' })
      .eq('id', roomId)
  }

  return NextResponse.json({ ok: true })
}

export const POST = withAxiomRoute(leaveRoom)
