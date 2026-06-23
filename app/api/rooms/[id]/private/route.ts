import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function getRoomPrivateInfo(
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
  const { data: room, error: roomError } = await admin
    .from('chat_rooms')
    .select('id, created_by, status, payout_revealed_at')
    .eq('id', roomId)
    .maybeSingle()

  if (roomError) {
    return NextResponse.json({ error: '채팅방 정보를 확인하지 못했습니다' }, { status: 500 })
  }

  if (!room) {
    return NextResponse.json({ error: '채팅방을 찾을 수 없습니다' }, { status: 404 })
  }

  const { data: participants, error: participantsError } = await admin
    .from('room_participants')
    .select('user_id')
    .eq('room_id', roomId)

  if (participantsError) {
    return NextResponse.json({ error: '참여자 정보를 확인하지 못했습니다' }, { status: 500 })
  }

  const participantIds = Array.from(new Set((participants ?? []).map((participant) => participant.user_id)))
  const isParticipant = participantIds.includes(authUser.id)

  if (!isParticipant) {
    return NextResponse.json({ error: '채팅방 참여자만 확인할 수 있습니다' }, { status: 403 })
  }

  const [phonesResult, payoutResult] = await Promise.all([
    participantIds.length > 0
      ? admin
          .from('user_private_profiles')
          .select('user_id, phone')
          .in('user_id', participantIds)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from('user_private_profiles')
      .select('user_id, bank_name, account_number, account_holder, created_at, updated_at')
      .eq('user_id', room.created_by)
      .maybeSingle(),
  ])

  if (phonesResult.error) {
    return NextResponse.json({ error: '참여자 연락처를 확인하지 못했습니다' }, { status: 500 })
  }

  if (payoutResult.error) {
    return NextResponse.json({ error: '방장 계좌 정보를 확인하지 못했습니다' }, { status: 500 })
  }

  const phonesByUserId = Object.fromEntries(
    (phonesResult.data ?? []).map((profile) => [profile.user_id, profile.phone])
  )

  const creatorPayout = payoutResult.data
  const isCreator = authUser.id === room.created_by
  const payoutRevealed = Boolean(room.payout_revealed_at)
  const creatorHasPayoutAccount = Boolean(creatorPayout?.bank_name)

  return NextResponse.json({
    phonesByUserId,
    creatorPayoutAccount: (isCreator || payoutRevealed) && creatorHasPayoutAccount ? creatorPayout : null,
    creatorHasPayoutAccount,
    payoutRevealed,
  })
}

export const GET = withAxiomRoute(getRoomPrivateInfo)
