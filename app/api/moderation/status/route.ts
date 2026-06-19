import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function createAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('운영 상태 설정이 아직 연결되지 않았습니다')
  }

  return createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function getModerationStatus() {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const authUser = data.user

  if (authError || !authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const admin = createAdminSupabase()
  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('id, status, suspended_until, suspension_reason, moderation_updated_at')
    .eq('id', authUser.id)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ error: '운영 상태를 확인하지 못했습니다' }, { status: 500 })
  }

  if (!profile) {
    return NextResponse.json({
      status: 'profile_required',
      suspendedUntil: null,
      suspensionReason: null,
      warning: null,
    })
  }

  let status = profile.status
  let suspendedUntil = profile.suspended_until
  let suspensionReason = profile.suspension_reason

  if (status === 'suspended' && suspendedUntil && new Date(suspendedUntil).getTime() <= Date.now()) {
    const { error: releaseError } = await admin
      .from('users')
      .update({
        status: 'active',
        suspended_until: null,
        suspension_reason: null,
        moderation_updated_at: new Date().toISOString(),
      })
      .eq('id', authUser.id)

    if (!releaseError) {
      status = 'active'
      suspendedUntil = null
      suspensionReason = null
    }
  }

  const { data: warning, error: warningError } = await admin
    .from('user_moderation_actions')
    .select('id, reason, created_at')
    .eq('user_id', authUser.id)
    .eq('action', 'warning')
    .is('acknowledged_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (warningError) {
    return NextResponse.json({ error: '경고 내용을 확인하지 못했습니다' }, { status: 500 })
  }

  return NextResponse.json({
    status,
    suspendedUntil,
    suspensionReason,
    warning: warning ?? null,
  })
}

export const GET = withAxiomRoute(getModerationStatus)
