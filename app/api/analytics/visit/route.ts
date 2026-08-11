import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ADMIN_USER_ID = '5a018580-6558-44fc-a621-1fa2506e9d5e'

type VisitPayload = {
  path?: unknown
}

function normalizePath(value: unknown) {
  if (typeof value !== 'string') return null
  const path = value.trim()
  return path ? path.slice(0, 200) : null
}

async function recordVisit(request: Request) {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const authUser = data.user

  if (authError || !authUser) {
    return NextResponse.json({ error: '인증 세션이 준비되지 않았습니다' }, { status: 401 })
  }

  // 관리자 방문은 저장 단계부터 제외해 Metrics 누락/실수 가능성을 줄인다.
  if (authUser.id === ADMIN_USER_ID) {
    return new NextResponse(null, { status: 204 })
  }

  const payload = await request.json().catch(() => null) as VisitPayload | null
  const admin = createAdminSupabase()
  const { data: profile, error: profileError } = await admin
    .from('user_private_profiles')
    .select('is_admin')
    .eq('user_id', authUser.id)
    .maybeSingle()

  if (profileError) {
    console.error('Visit tracking profile lookup error:', profileError)
    return NextResponse.json({ error: '프로필을 확인하지 못했습니다' }, { status: 503 })
  }

  if (profile?.is_admin) {
    return new NextResponse(null, { status: 204 })
  }

  const { error: insertError } = await admin
    .from('user_visit_events')
    .insert({
      user_id: authUser.id,
      path: normalizePath(payload?.path),
    })

  if (insertError) {
    console.error('Visit tracking insert error:', insertError)
    return NextResponse.json({ error: '방문 기록을 저장하지 못했습니다' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}

export const POST = withAxiomRoute(recordVisit)
