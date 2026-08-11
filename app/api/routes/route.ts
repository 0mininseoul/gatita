import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createClient } from '@/lib/supabase/server'
import { isRestrictedRoutePair, LOCATIONS, type LocationType } from '@/lib/supabase'
import { buildRouteCreateInput } from '@/lib/routeSubscriptionValidation'

export const dynamic = 'force-dynamic'

const SELECT = 'id, from_location, to_location, notify_enabled, notify_from, notify_to, notify_weekdays'

async function listRoutes() {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const user = data.user

  if (authError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  // RLS가 auth.uid() = user_id 를 강제하지만, admin 클라이언트로 바뀔 미래를 대비해
  // 코드에서도 명시적으로 본인 것만 조회한다.
  const { data: routes, error } = await supabase
    .from('favorites')
    .select(SELECT)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('List route subscriptions error:', error)
    return NextResponse.json({ error: '경로를 불러오지 못했습니다' }, { status: 500 })
  }

  return NextResponse.json({ routes: routes ?? [] })
}

async function createRoute(request: Request) {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const user = data.user

  if (authError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)

  // 경로 유효성, notify_from/notify_to 페어링·동등성, 요일 배열 기본값은
  // PATCH(app/api/routes/[id]/route.ts)와 공유하는 순수 함수(lib/routeSubscriptionValidation.ts)로
  // 검증한다 — 두 라우트가 각자 판정 로직을 들고 있다가 어긋나는 사고를 막는다.
  const result = buildRouteCreateInput(
    body ?? {},
    Object.keys(LOCATIONS),
    (from, to) => isRestrictedRoutePair(from as LocationType, to as LocationType),
  )
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  const { from, to, notifyFrom, notifyTo, weekdays } = result.input

  const { data: route, error } = await supabase
    .from('favorites')
    .upsert(
      {
        user_id: user.id,
        from_location: from as LocationType,
        to_location: to as LocationType,
        notify_enabled: true,
        notify_from: notifyFrom,
        notify_to: notifyTo,
        notify_weekdays: weekdays,
      },
      { onConflict: 'user_id,from_location,to_location' },
    )
    .select(SELECT)
    .single()

  if (error) {
    console.error('Create route subscription error:', error)
    return NextResponse.json({ error: '경로를 저장하지 못했습니다' }, { status: 500 })
  }

  return NextResponse.json({ route })
}

export const GET = withAxiomRoute(listRoutes)
export const POST = withAxiomRoute(createRoute)
