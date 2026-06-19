import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function createAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('운영 상태 설정이 아직 연결되지 않았습니다')
  }

  return createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function acknowledgeModerationWarning(request: Request) {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const authUser = data.user

  if (authError || !authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  let payload: { actionId?: string }

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다' }, { status: 400 })
  }

  if (!payload.actionId) {
    return NextResponse.json({ error: '확인할 경고를 찾지 못했습니다' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const { error } = await admin
    .from('user_moderation_actions')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', payload.actionId)
    .eq('user_id', authUser.id)
    .eq('action', 'warning')

  if (error) {
    return NextResponse.json({ error: '경고 확인을 저장하지 못했습니다' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export const POST = withAxiomRoute(acknowledgeModerationWarning)
