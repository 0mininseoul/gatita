import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const DELETE_CONFIRMATION_TEXT = '떠나지 말아주세요. 탈퇴하시는 이유를 여쭤봐도 될까요? 열심히 만들었어요 흑흑'

async function deleteAccount(request: Request) {
  let payload: { confirmation?: string }

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다' }, { status: 400 })
  }

  if (payload.confirmation !== DELETE_CONFIRMATION_TEXT) {
    return NextResponse.json({ error: '확인 문구가 일치하지 않습니다' }, { status: 400 })
  }

  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const user = data.user

  if (authError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const admin = createAdminSupabase()

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)

  if (deleteError) {
    return NextResponse.json(
      { error: '계정을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}

export const POST = withAxiomRoute(deleteAccount)
