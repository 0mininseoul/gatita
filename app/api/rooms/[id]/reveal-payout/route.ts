import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function revealPayout(
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
    .select('id, created_by, payout_revealed_at')
    .eq('id', roomId)
    .maybeSingle()

  if (roomError) {
    return NextResponse.json({ error: '채팅방 정보를 확인하지 못했습니다' }, { status: 500 })
  }

  if (!room) {
    return NextResponse.json({ error: '채팅방을 찾을 수 없습니다' }, { status: 404 })
  }

  if (room.created_by !== authUser.id) {
    return NextResponse.json({ error: '방장만 계좌를 공개할 수 있습니다' }, { status: 403 })
  }

  const { data: payout, error: payoutError } = await admin
    .from('user_private_profiles')
    .select('user_id, bank_name, account_number, account_holder, created_at, updated_at')
    .eq('user_id', authUser.id)
    .maybeSingle()

  if (payoutError) {
    return NextResponse.json({ error: '계좌 정보를 확인하지 못했습니다' }, { status: 500 })
  }

  if (!payout?.bank_name) {
    return NextResponse.json({ error: '계좌를 먼저 등록해주세요' }, { status: 400 })
  }

  if (!room.payout_revealed_at) {
    const { error: updateError } = await admin
      .from('chat_rooms')
      .update({ payout_revealed_at: new Date().toISOString() })
      .eq('id', roomId)
      .eq('created_by', authUser.id)

    if (updateError) {
      return NextResponse.json({ error: '계좌 공개 중 오류가 발생했습니다' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, creatorPayoutAccount: payout })
}

export const POST = withAxiomRoute(revealPayout)
