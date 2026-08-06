import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createClient } from '@/lib/supabase/server'

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

  const patch: Record<string, unknown> = {}
  if (typeof body.notify_enabled === 'boolean') patch.notify_enabled = body.notify_enabled
  if ('notify_from' in body) patch.notify_from = body.notify_from ?? null
  if ('notify_to' in body) patch.notify_to = body.notify_to ?? null
  if (Array.isArray(body.notify_weekdays) && body.notify_weekdays.length > 0) {
    patch.notify_weekdays = body.notify_weekdays
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 내용이 없습니다' }, { status: 400 })
  }
  if (('notify_from' in patch) !== ('notify_to' in patch)) {
    return NextResponse.json({ error: '시작 시각과 종료 시각을 함께 설정해주세요' }, { status: 400 })
  }
  // isWithinNotifyWindow는 notify_from > notify_to일 때만 자정 넘김으로 해석한다.
  // 두 값이 같으면(예: 09:00~09:00) 그 정확히 1분만 통과하는 사실상 죽은 구독이
  // 되어버리므로, 사용자가 알림이 온다고 믿는 조용한 실패를 막기 위해 여기서 막는다.
  if (patch.notify_from !== null && patch.notify_from === patch.notify_to) {
    return NextResponse.json({ error: '시작 시각과 종료 시각을 다르게 설정해주세요' }, { status: 400 })
  }

  // RLS가 auth.uid() = user_id 를 강제하지만, admin 클라이언트로 바뀔 미래를 대비해
  // 코드에서도 명시적으로 본인 것만 대상으로 삼는다.
  const { data: route, error } = await supabase
    .from('favorites')
    .update(patch)
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
