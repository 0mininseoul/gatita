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

  const [publicProfileResult, privateProfileResult, payoutResult] = await Promise.all([
    admin
      .from('users')
      .select('id, nickname, nickname_updated_at, department, created_at, updated_at')
      .eq('id', authUser.id)
      .maybeSingle(),
    admin
      .from('user_private_profiles')
      .select('user_id, email, name, phone, phone_verified_at, phone_mfa_factor_id, status, suspended_until, suspension_reason, moderation_updated_at, is_admin, created_at, updated_at')
      .eq('user_id', authUser.id)
      .maybeSingle(),
    admin
      .from('user_payout_accounts')
      .select('user_id, bank_name, account_number, account_holder, created_at, updated_at')
      .eq('user_id', authUser.id)
      .maybeSingle(),
  ])

  const firstError = publicProfileResult.error || privateProfileResult.error || payoutResult.error

  if (firstError) {
    console.error('Profile me load error:', firstError)
    return NextResponse.json({ error: '프로필을 불러오지 못했습니다' }, { status: 500 })
  }

  const publicProfile = publicProfileResult.data
  const privateProfile = privateProfileResult.data

  const payoutAccount = payoutResult.data

  if (!publicProfile || !privateProfile || !payoutAccount) {
    return NextResponse.json({
      profileCompleted: false,
      user: null,
      payoutAccount: null,
    })
  }

  return NextResponse.json({
    profileCompleted: true,
    user: {
      ...publicProfile,
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
