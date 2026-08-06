import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createClient } from '@/lib/supabase/server'
import { buildRouteUpdatePatch } from '@/lib/routeSubscriptionValidation'

export const dynamic = 'force-dynamic'

const SELECT = 'id, from_location, to_location, notify_enabled, notify_from, notify_to, notify_weekdays'

async function updateRoute(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const user = data.user

  if (authError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 })
  }

  // notify_enabled/notify_from/notify_to/notify_weekdays 파싱과 페어링·동등성 검사는
  // POST(app/api/routes/route.ts)와 공유하는 순수 함수(lib/routeSubscriptionValidation.ts)로
  // 처리한다. 예전에는 이 라우트가 patch 객체 위에서 직접 시작/종료 시각의 동등성을
  // 비교했는데, 부분 업데이트에서 키 자체가 없을 때 그 값이 undefined가 되는 걸
  // 놓쳐 두 undefined가 서로 같다고 평가되면서 { notify_enabled: false }만 보내는
  // 흔한 토글 요청까지 400으로 잘못 거부했었다. buildRouteUpdatePatch는 "키가
  // 없음"과 "명시적으로 null"을 presence 기준으로 구분해 이 문제를 없앤다.
  const result = buildRouteUpdatePatch(body)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  // RLS가 auth.uid() = user_id 를 강제하지만, admin 클라이언트로 바뀔 미래를 대비해
  // 코드에서도 명시적으로 본인 것만 대상으로 삼는다.
  const { data: route, error } = await supabase
    .from('favorites')
    .update(result.patch)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select(SELECT)
    .maybeSingle()

  if (error) {
    console.error('Update route subscription error:', error)
    return NextResponse.json({ error: '경로를 수정하지 못했습니다' }, { status: 500 })
  }
  if (!route) {
    return NextResponse.json({ error: '경로를 찾을 수 없습니다' }, { status: 404 })
  }

  return NextResponse.json({ route })
}

async function deleteRoute(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const user = data.user

  if (authError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  // RLS가 auth.uid() = user_id 를 강제하지만, admin 클라이언트로 바뀔 미래를 대비해
  // 코드에서도 명시적으로 본인 것만 대상으로 삼는다. delete()가 지운 행을 select로
  // 되받아, 남의 행이라 0건 삭제됐을 때도 성공한 척하지 않고 404를 낸다.
  const { data: deleted, error } = await supabase
    .from('favorites')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('Delete route subscription error:', error)
    return NextResponse.json({ error: '경로를 삭제하지 못했습니다' }, { status: 500 })
  }
  if (!deleted) {
    return NextResponse.json({ error: '경로를 찾을 수 없습니다' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}

export const PATCH = withAxiomRoute(updateRoute)
export const DELETE = withAxiomRoute(deleteRoute)
