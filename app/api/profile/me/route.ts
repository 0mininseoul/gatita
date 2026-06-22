import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function getMyProfile() {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const authUser = data.user

  if (authError || !authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const admin = createAdminSupabase()

  const [publicProfileResult, privateProfileResult] = await Promise.all([
    admin
      .from('users')
      .select('id, nickname, nickname_updated_at, department, avatar_url, created_at, updated_at')
      .eq('id', authUser.id)
      .maybeSingle(),
    admin
      .from('user_private_profiles')
      .select('user_id, email, name, phone, phone_verified_at, phone_mfa_factor_id, bank_name, account_number, account_holder, status, suspended_until, suspension_reason, moderation_updated_at, is_admin, onboarded_at, created_at, updated_at')
      .eq('user_id', authUser.id)
      .maybeSingle(),
  ])

  const firstError = publicProfileResult.error || privateProfileResult.error

  if (firstError) {
    console.error('Profile me load error:', firstError)
    return NextResponse.json({ error: '프로필을 불러오지 못했습니다' }, { status: 500 })
  }

  const publicProfile = publicProfileResult.data
  const privateProfile = privateProfileResult.data

  if (!publicProfile || !privateProfile || !privateProfile.onboarded_at) {
    return NextResponse.json({
      profileCompleted: false,
      user: null,
      payoutAccount: null,
    })
  }

  const payoutAccount = privateProfile.bank_name
    ? {
        user_id: privateProfile.user_id,
        bank_name: privateProfile.bank_name,
        account_number: privateProfile.account_number,
        account_holder: privateProfile.account_holder,
        created_at: privateProfile.created_at,
        updated_at: privateProfile.updated_at,
      }
    : null

  return NextResponse.json({
    profileCompleted: true,
    user: {
      id: publicProfile.id,
      nickname: publicProfile.nickname,
      nickname_updated_at: publicProfile.nickname_updated_at,
      department: publicProfile.department,
      avatar_url: publicProfile.avatar_url,
      created_at: publicProfile.created_at,
      updated_at: publicProfile.updated_at,
      email: privateProfile.email,
      name: privateProfile.name,
      phone: privateProfile.phone,
      phone_verified_at: privateProfile.phone_verified_at,
      phone_mfa_factor_id: privateProfile.phone_mfa_factor_id,
      status: privateProfile.status,
      suspended_until: privateProfile.suspended_until,
      suspension_reason: privateProfile.suspension_reason,
      moderation_updated_at: privateProfile.moderation_updated_at,
      is_admin: privateProfile.is_admin,
      private_created_at: privateProfile.created_at,
      private_updated_at: privateProfile.updated_at,
    },
    payoutAccount,
  })
}

export const GET = withAxiomRoute(getMyProfile)
