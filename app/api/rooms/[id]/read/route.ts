import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function markRoomRead(
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
  const { error } = await admin
    .from('room_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('user_id', authUser.id)

  if (error) {
    console.error('Mark room read error:', error)
    return NextResponse.json({ error: '읽음 처리에 실패했습니다' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export const POST = withAxiomRoute(markRoomRead)
