import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createClient } from '@/lib/supabase/server'
import { isRestrictedRoutePair, LOCATIONS, type LocationType } from '@/lib/supabase'

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
  const from = body?.from_location as LocationType | undefined
  const to = body?.to_location as LocationType | undefined

  if (!from || !to || !(from in LOCATIONS) || !(to in LOCATIONS)) {
    return NextResponse.json({ error: '출발지와 도착지를 선택해주세요' }, { status: 400 })
  }
  if (from === to || isRestrictedRoutePair(from, to)) {
    return NextResponse.json({ error: '선택할 수 없는 경로입니다' }, { status: 400 })
  }

  const weekdays: number[] = Array.isArray(body?.notify_weekdays) && body.notify_weekdays.length > 0
    ? body.notify_weekdays
    : [0, 1, 2, 3, 4, 5, 6]

  const notifyFrom = body?.notify_from ?? null
  const notifyTo = body?.notify_to ?? null
  if ((notifyFrom === null) !== (notifyTo === null)) {
    return NextResponse.json({ error: '시작 시각과 종료 시각을 함께 설정해주세요' }, { status: 400 })
  }
  // isWithinNotifyWindow는 notify_from > notify_to일 때만 자정 넘김으로 해석한다.
  // 두 값이 같으면(예: 09:00~09:00) 그 정확히 1분만 통과하는 사실상 죽은 구독이
  // 되어버리므로, 사용자가 알림이 온다고 믿는 조용한 실패를 막기 위해 여기서 막는다.
  if (notifyFrom !== null && notifyFrom === notifyTo) {
    return NextResponse.json({ error: '시작 시각과 종료 시각을 다르게 설정해주세요' }, { status: 400 })
  }

  const { data: route, error } = await supabase
    .from('favorites')
    .upsert(
      {
        user_id: user.id,
        from_location: from,
        to_location: to,
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
