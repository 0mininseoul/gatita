import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// room_participation_events upsert 전용 최소 라우트.
// /join 라우트는 이미 참여 중인 이용자에게 alreadyJoined 로 조기 반환하므로
// (room_participants insert 이전에 리턴) 이력 upsert 코드까지 도달하지 않는다.
// 방 생성 시 클라이언트가 room_participants 에 직접 insert 하는 경로(HomeClient.tsx)에서는
// 이 조기 반환 때문에 /join 을 재사용할 수 없어 참여자 정원 로직을 건드리지 않는
// 별도 라우트로 이력만 기록한다.
async function recordRoomHistory(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const roomId = params.id

  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const authUser = data.user

  if (authError || !authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const admin = createAdminSupabase()

  // roomId 는 방 참여자라면 누구나 관찰 가능하므로, 세션 인증만으로는
  // "실제로 그 방에 참여했는지"를 보장하지 못한다. room_participants 에
  // 실제 행이 있는 경우에만 이력을 기록해, 참여한 적 없는 방에 대한 이력
  // 위조나 나간 방의 left_at 을 되돌리는 것을 막는다.
  const { data: participant, error: participantError } = await admin
    .from('room_participants')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', authUser.id)
    .maybeSingle()

  if (participantError) {
    return NextResponse.json({ error: '참여자 정보를 확인하지 못했습니다' }, { status: 500 })
  }

  if (!participant) {
    return NextResponse.json({ error: '채팅방 참여자만 이력을 기록할 수 있습니다' }, { status: 403 })
  }

  const { error: historyError } = await admin
    .from('room_participation_events')
    .upsert(
      { room_id: roomId, user_id: authUser.id, joined_at: new Date().toISOString(), left_at: null },
      { onConflict: 'room_id,user_id' },
    )

  if (historyError) {
    console.error('participation history record error:', historyError)
    return NextResponse.json({ error: '참여 이력을 기록하지 못했습니다' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export const POST = withAxiomRoute(recordRoomHistory)
