import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function confirmParticipation(
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

  const { data: profile, error: profileError } = await admin
    .from('user_private_profiles')
    .select('user_id, status')
    .eq('user_id', authUser.id)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ error: '프로필을 확인하지 못했습니다' }, { status: 500 })
  }

  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: '서비스 이용이 제한된 계정입니다' }, { status: 403 })
  }

  const { data: participant, error: participantError } = await admin
    .from('room_participants')
    .select('id, confirmed')
    .eq('room_id', roomId)
    .eq('user_id', authUser.id)
    .maybeSingle()

  if (participantError) {
    return NextResponse.json({ error: '참여 상태를 확인하지 못했습니다' }, { status: 500 })
  }

  if (!participant) {
    return NextResponse.json({ error: '채팅방 참여자만 확정할 수 있습니다' }, { status: 403 })
  }

  if (participant.confirmed) {
    return NextResponse.json({ ok: true, alreadyConfirmed: true })
  }

  const { error: updateError } = await admin
    .from('room_participants')
    .update({ confirmed: true })
    .eq('id', participant.id)
    .eq('user_id', authUser.id)

  if (updateError) {
    return NextResponse.json({ error: '참여 확정을 저장하지 못했습니다' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export const POST = withAxiomRoute(confirmParticipation)
