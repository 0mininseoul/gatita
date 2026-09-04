import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type DormitoryProfilePayload = {
  is_dormitory_resident?: boolean | null
}

async function updateDormitoryProfile(request: Request) {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const authUser = data.user

  if (authError || !authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const payload = await request.json().catch(() => null) as DormitoryProfilePayload | null
  const value = payload?.is_dormitory_resident

  if (!payload || !(value === null || typeof value === 'boolean')) {
    return NextResponse.json({ error: '기숙사생 여부 값이 올바르지 않습니다' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const { data: updatedProfile, error } = await admin
    .from('user_private_profiles')
    .update({
      is_dormitory_resident: payload.is_dormitory_resident,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', authUser.id)
    .select('is_dormitory_resident')
    .maybeSingle()

  if (error) {
    console.error('Dormitory profile update error:', error)
    return NextResponse.json({ error: '기숙사생 설정을 저장하지 못했습니다' }, { status: 500 })
  }

  if (!updatedProfile) {
    return NextResponse.json({ error: '프로필을 찾지 못했습니다' }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    is_dormitory_resident: updatedProfile.is_dormitory_resident,
  })
}

export const PATCH = withAxiomRoute(updateDormitoryProfile)
