import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type SubscribePayload = {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
  userAgent?: string
}

async function saveSubscription(request: Request) {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const user = data.user

  if (authError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  let payload: SubscribePayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 })
  }

  const endpoint = payload.endpoint
  const p256dh = payload.keys?.p256dh
  const auth = payload.keys?.auth

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: '구독 정보가 올바르지 않습니다' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: payload.userAgent ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )

  if (error) {
    console.error('Push subscribe save error:', error)
    return NextResponse.json({ error: '구독 저장에 실패했습니다' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export const POST = withAxiomRoute(saveSubscription)
