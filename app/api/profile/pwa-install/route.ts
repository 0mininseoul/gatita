import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function markPwaInstalled() {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const authUser = data.user

  if (authError || !authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const admin = createAdminSupabase()
  const { error } = await admin
    .from('user_private_profiles')
    .update({ pwa_installed: true })
    .eq('user_id', authUser.id)

  if (error) {
    console.error('PWA install sync error:', error)
    return NextResponse.json({ error: 'PWA 설치 상태를 저장하지 못했습니다' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export const POST = withAxiomRoute(markPwaInstalled)
