import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function removeSubscription(request: Request) {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const user = data.user

  if (authError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  let endpoint: string | undefined
  try {
    const payload = await request.json()
    endpoint = payload?.endpoint
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 })
  }

  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint 가 필요합니다' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const { error } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id)

  if (error) {
    console.error('Push unsubscribe error:', error)
    return NextResponse.json({ error: '구독 해제에 실패했습니다' }, { status: 500 })
  }

  // 남은 구독이 있으면 push_enabled 유지, 없으면 false 로 (다른 기기 구독 고려).
  const { count } = await admin
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const { error: trackError } = await admin
    .from('user_private_profiles')
    .update({ push_enabled: (count ?? 0) > 0 })
    .eq('user_id', user.id)

  if (trackError) {
    console.error('push_enabled track error:', trackError)
  }

  return NextResponse.json({ ok: true })
}

export const POST = withAxiomRoute(removeSubscription)
