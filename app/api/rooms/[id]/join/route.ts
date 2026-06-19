import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isRoomJoinable } from '@/lib/supabase'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const roomId = params.id

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: '채팅방 참여 설정이 아직 연결되지 않았습니다' },
      { status: 500 },
    )
  }

  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const authUser = data.user

  if (authError || !authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('id, status')
    .eq('id', authUser.id)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ error: '프로필을 확인하지 못했습니다' }, { status: 500 })
  }

  if (!profile) {
    return NextResponse.json({ error: '프로필 설정이 필요합니다' }, { status: 403 })
  }

  if (profile.status !== 'active') {
    return NextResponse.json({ error: '서비스 이용이 정지된 계정입니다' }, { status: 403 })
  }

  const { data: room, error: roomError } = await admin
    .from('chat_rooms')
    .select('id, departure_date, departure_time, max_participants, status')
    .eq('id', roomId)
    .maybeSingle()

  if (roomError) {
    return NextResponse.json({ error: '채팅방 정보를 확인하지 못했습니다' }, { status: 500 })
  }

  if (!room || room.status !== 'active') {
    return NextResponse.json({ error: '참여할 수 없는 채팅방입니다' }, { status: 404 })
  }

  if (!isRoomJoinable(room.departure_date, room.departure_time)) {
    return NextResponse.json({ error: '이미 지난 출발 시간입니다' }, { status: 409 })
  }

  const { data: participants, error: participantsError } = await admin
    .from('room_participants')
    .select('id, user_id')
    .eq('room_id', roomId)

  if (participantsError) {
    return NextResponse.json({ error: '참여자 정보를 확인하지 못했습니다' }, { status: 500 })
  }

  const currentParticipants = participants ?? []

  if (currentParticipants.some((participant) => participant.user_id === authUser.id)) {
    return NextResponse.json({ ok: true, alreadyJoined: true })
  }

  if (currentParticipants.length >= room.max_participants) {
    return NextResponse.json({ error: '채팅방이 가득 찼습니다' }, { status: 409 })
  }

  const { error: joinError } = await admin
    .from('room_participants')
    .insert({
      room_id: roomId,
      user_id: authUser.id,
      confirmed: false,
    })

  if (joinError) {
    if (joinError.code === '23505') {
      return NextResponse.json({ ok: true, alreadyJoined: true })
    }

    console.error('Join room API error:', joinError)
    return NextResponse.json({ error: '채팅방에 참여하지 못했습니다' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
