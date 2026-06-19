import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type ModerationAction = 'warning' | 'suspend_7d' | 'suspend_30d' | 'suspend_permanent' | 'release'
type ReportResolutionAction = Exclude<ModerationAction, 'release'> | 'no_action'

type AdminActionPayload =
  | {
      type: 'user-status'
      userId: string
      status: 'active' | 'suspended'
    }
  | {
      type: 'report-status'
      reportId: string
      status: 'reviewed' | 'resolved'
    }
  | {
      type: 'moderation-action'
      userId: string
      action: ModerationAction
      reportId?: string
      reason?: string
    }
  | {
      type: 'report-resolution'
      reportId: string
      action: ReportResolutionAction
      reason?: string
    }

const MODERATION_ACTION_LABELS = {
  warning: '경고',
  suspend_7d: '7일 정지',
  suspend_30d: '30일 정지',
  suspend_permanent: '영구 정지',
  release: '해제',
}

const REPORT_RESOLUTION_LABELS: Record<ReportResolutionAction, string> = {
  no_action: '조치 안함',
  warning: '경고',
  suspend_7d: '7일 정지',
  suspend_30d: '30일 정지',
  suspend_permanent: '영구 정지',
}

function getSuspensionUntil(action: ModerationAction) {
  if (action !== 'suspend_7d' && action !== 'suspend_30d') return null

  const suspendedUntil = new Date()
  suspendedUntil.setDate(suspendedUntil.getDate() + (action === 'suspend_7d' ? 7 : 30))
  return suspendedUntil.toISOString()
}

function isMissingModerationTable(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /user_moderation_actions/.test(error.message ?? '')
}

async function requireAdmin() {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const authUser = data.user

  if (authError || !authUser) {
    return {
      error: NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 }),
      admin: null,
      authUser: null,
    }
  }

  const admin = createAdminSupabase()
  const [publicProfileResult, privateProfileResult] = await Promise.all([
    admin
    .from('users')
      .select('id, nickname, department')
    .eq('id', authUser.id)
      .maybeSingle(),
    admin
      .from('user_private_profiles')
      .select('user_id, email, is_admin, status')
      .eq('user_id', authUser.id)
      .maybeSingle(),
  ])

  if (publicProfileResult.error || privateProfileResult.error) {
    return {
      error: NextResponse.json({ error: '관리자 권한을 확인하지 못했습니다' }, { status: 500 }),
      admin: null,
      authUser,
    }
  }

  const publicProfile = publicProfileResult.data
  const privateProfile = privateProfileResult.data

  if (!publicProfile || !privateProfile?.is_admin || privateProfile.status !== 'active') {
    return {
      error: NextResponse.json({ error: '관리자만 접근할 수 있습니다' }, { status: 403 }),
      admin: null,
      authUser,
    }
  }

  return {
    error: null,
    admin,
    authUser,
    profile: {
      ...publicProfile,
      email: privateProfile.email,
      is_admin: privateProfile.is_admin,
      status: privateProfile.status,
    },
  }
}

async function getDashboard(request: Request) {
  let adminContext

  try {
    adminContext = await requireAdmin()
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '관리자 설정을 확인하지 못했습니다' },
      { status: 500 },
    )
  }

  if (adminContext.error) return adminContext.error

  const { admin, profile } = adminContext
  const roomId = new URL(request.url).searchParams.get('roomId')

  const [
    usersResult,
    privateProfilesResult,
    reportsResult,
    roomsResult,
    messagesResult,
    moderationActionsResult,
  ] = await Promise.all([
    admin
      .from('users')
      .select('id, nickname, nickname_updated_at, department, created_at, updated_at')
      .order('created_at', { ascending: false }),
    admin
      .from('user_private_profiles')
      .select('user_id, email, name, phone, status, suspended_until, suspension_reason, moderation_updated_at, is_admin, created_at, updated_at')
      .order('created_at', { ascending: false }),
    admin
      .from('reports')
      .select(`
        id,
        room_id,
        reporter_id,
        reported_id,
        reason,
        status,
        resolution_action,
        resolution_note,
        resolved_by,
        resolved_at,
        created_at,
        reporter:reporter_id(nickname, department),
        reported:reported_id(nickname, department),
        resolver:resolved_by(nickname, department),
        room:room_id(title, from_location, to_location, departure_date, departure_time)
      `)
      .order('created_at', { ascending: false }),
    admin
      .from('chat_rooms')
      .select(`
        id,
        title,
        from_location,
        to_location,
        departure_date,
        departure_time,
        max_participants,
        created_by,
        status,
        created_at,
        creator:created_by(nickname, department),
        participants:room_participants(
          id,
          user_id,
          user:users(nickname, department)
        )
      `)
      .order('created_at', { ascending: false }),
    roomId
      ? admin
          .from('messages')
          .select(`
            id,
            room_id,
            user_id,
            content,
            created_at,
            user:users(nickname, department)
          `)
          .eq('room_id', roomId)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    admin
      .from('user_moderation_actions')
      .select(`
        id,
        user_id,
        admin_id,
        report_id,
        action,
        reason,
        previous_status,
        next_status,
        suspended_until,
        acknowledged_at,
        created_at,
        admin:admin_id(nickname, department)
      `)
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  const firstError = usersResult.error || privateProfilesResult.error || reportsResult.error || roomsResult.error || messagesResult.error || moderationActionsResult.error

  if (firstError) {
    console.error('Admin dashboard load error:', firstError)
    return NextResponse.json({ error: '관리자 데이터를 불러오지 못했습니다' }, { status: 500 })
  }

  const creatorIds = Array.from(new Set(
    (roomsResult.data ?? [])
      .map((room) => room.created_by)
      .filter((creatorId): creatorId is string => typeof creatorId === 'string' && creatorId.length > 0),
  ))
  const payoutAccountsByUserId = new Map<string, unknown>()

  if (creatorIds.length > 0) {
    const { data: payoutAccounts, error: payoutError } = await admin
      .from('user_payout_accounts')
      .select('user_id, bank_name, account_number, account_holder, created_at, updated_at')
      .in('user_id', creatorIds)

    if (payoutError) {
      console.error('Admin payout account load error:', payoutError)
      return NextResponse.json({ error: '방장 계좌 정보를 불러오지 못했습니다' }, { status: 500 })
    }

    payoutAccounts?.forEach((account) => {
      payoutAccountsByUserId.set(account.user_id, account)
    })
  }

  const privateProfilesByUserId = new Map(
    (privateProfilesResult.data ?? []).map((privateProfile) => [privateProfile.user_id, privateProfile])
  )
  const getPrivateProfile = (userId?: string | null) => (
    userId ? privateProfilesByUserId.get(userId) ?? null : null
  )
  const attachPrivateEmail = (profileLike: unknown, userId?: string | null) => {
    if (!profileLike || typeof profileLike !== 'object') return profileLike
    const privateProfile = getPrivateProfile(userId)
    return {
      ...(profileLike as Record<string, unknown>),
      email: privateProfile?.email ?? null,
    }
  }

  return NextResponse.json({
    adminUser: profile,
    users: (usersResult.data ?? []).map((publicProfile) => ({
      ...publicProfile,
      ...(getPrivateProfile(publicProfile.id) ?? {}),
      id: publicProfile.id,
    })),
    reports: (reportsResult.data ?? []).map((report) => ({
      ...report,
      reporter: attachPrivateEmail(report.reporter, report.reporter_id),
      reported: attachPrivateEmail(report.reported, report.reported_id),
      resolver: attachPrivateEmail(report.resolver, report.resolved_by),
    })),
    rooms: (roomsResult.data ?? []).map((room) => ({
      ...room,
      creatorPayoutAccount: payoutAccountsByUserId.get(room.created_by) ?? null,
    })),
    messages: messagesResult.data ?? [],
    moderationActions: (moderationActionsResult.data ?? []).map((action) => ({
      ...action,
      admin: attachPrivateEmail(action.admin, action.admin_id),
    })),
  })
}

async function applyModerationAction({
  admin,
  adminId,
  userId,
  action,
  reportId,
  reason,
}: {
  admin: ReturnType<typeof createAdminSupabase>
  adminId: string
  userId: string
  action: ModerationAction
  reportId?: string | null
  reason?: string
}) {
  const actionLabel = MODERATION_ACTION_LABELS[action]

  if (!actionLabel) {
    return { error: NextResponse.json({ error: '지원하지 않는 운영 조치입니다' }, { status: 400 }) }
  }

  const { data: targetUser, error: targetError } = await admin
    .from('user_private_profiles')
    .select('user_id, status, is_admin')
    .eq('user_id', userId)
    .maybeSingle()

  if (targetError) {
    return { error: NextResponse.json({ error: '사용자 정보를 확인하지 못했습니다' }, { status: 500 }) }
  }

  if (!targetUser) {
    return { error: NextResponse.json({ error: '사용자를 찾을 수 없습니다' }, { status: 404 }) }
  }

  if (targetUser.is_admin) {
    return { error: NextResponse.json({ error: '관리자 계정은 운영 조치할 수 없습니다' }, { status: 403 }) }
  }

  const { error: moderationTableError } = await admin
    .from('user_moderation_actions')
    .select('id')
    .limit(1)

  if (moderationTableError) {
    if (isMissingModerationTable(moderationTableError)) {
      return { error: NextResponse.json({ error: '운영 조치 DB 마이그레이션이 필요합니다' }, { status: 500 }) }
    }

    return { error: NextResponse.json({ error: '운영 조치 이력을 확인하지 못했습니다' }, { status: 500 }) }
  }

  const suspendedUntil = getSuspensionUntil(action)
  const nextStatus = action === 'release' ? 'active' : action === 'warning' ? targetUser.status : 'suspended'
  const trimmedReason = reason?.trim() || actionLabel

  if (action !== 'warning') {
    const extendedUpdate = {
      status: nextStatus,
      suspended_until: action === 'release' ? null : suspendedUntil,
      suspension_reason: action === 'release' ? null : trimmedReason,
      moderation_updated_at: new Date().toISOString(),
    }

    const { error: extendedUpdateError } = await admin
      .from('user_private_profiles')
      .update(extendedUpdate)
      .eq('user_id', userId)

    if (extendedUpdateError) {
      return { error: NextResponse.json({ error: '사용자 운영 상태를 변경하지 못했습니다' }, { status: 500 }) }
    }
  }

  const { error: actionLogError } = await admin
    .from('user_moderation_actions')
    .insert({
      user_id: userId,
      admin_id: adminId,
      report_id: reportId || null,
      action,
      reason: trimmedReason,
      previous_status: targetUser.status,
      next_status: nextStatus,
      suspended_until: suspendedUntil,
    })

  if (actionLogError) {
    console.error('Admin moderation action log error:', actionLogError)
    return { error: NextResponse.json({ error: '운영 조치 이력을 저장하지 못했습니다' }, { status: 500 }) }
  }

  return { error: null, reason: trimmedReason }
}

async function updateDashboard(request: Request) {
  let adminContext

  try {
    adminContext = await requireAdmin()
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '관리자 설정을 확인하지 못했습니다' },
      { status: 500 },
    )
  }

  if (adminContext.error) return adminContext.error

  const { admin, authUser } = adminContext
  const payload = await request.json().catch(() => null) as AdminActionPayload | null

  if (!payload?.type) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다' }, { status: 400 })
  }

  if (payload.type === 'user-status') {
    const { error } = await admin
      .from('user_private_profiles')
      .update({ status: payload.status })
      .eq('user_id', payload.userId)

    if (error) {
      return NextResponse.json({ error: '사용자 상태를 변경하지 못했습니다' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  if (payload.type === 'report-status') {
    const updatePayload: {
      status: 'reviewed' | 'resolved'
      resolution_action?: ReportResolutionAction
      resolution_note?: string
      resolved_by?: string | null
      resolved_at?: string
    } = { status: payload.status }

    if (payload.status === 'resolved') {
      updatePayload.resolution_action = 'no_action'
      updatePayload.resolution_note = '조치 안함'
      updatePayload.resolved_by = authUser?.id ?? null
      updatePayload.resolved_at = new Date().toISOString()
    }

    const { error } = await admin
      .from('reports')
      .update(updatePayload)
      .eq('id', payload.reportId)

    if (error) {
      return NextResponse.json({ error: '신고 상태를 변경하지 못했습니다' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  if (payload.type === 'report-resolution') {
    const actionLabel = REPORT_RESOLUTION_LABELS[payload.action]

    if (!actionLabel) {
      return NextResponse.json({ error: '지원하지 않는 신고 처리입니다' }, { status: 400 })
    }

    const { data: report, error: reportError } = await admin
      .from('reports')
      .select('id, reported_id, reason')
      .eq('id', payload.reportId)
      .maybeSingle()

    if (reportError) {
      return NextResponse.json({ error: '신고 정보를 확인하지 못했습니다' }, { status: 500 })
    }

    if (!report) {
      return NextResponse.json({ error: '신고를 찾을 수 없습니다' }, { status: 404 })
    }

    const reason = payload.reason?.trim() || (payload.action === 'no_action' ? '조치 안함' : report.reason)

    if (payload.action !== 'no_action') {
      if (!report.reported_id) {
        return NextResponse.json({ error: '신고 대상 사용자를 확인하지 못했습니다' }, { status: 400 })
      }

      const moderationResult = await applyModerationAction({
        admin,
        adminId: authUser?.id ?? '',
        userId: report.reported_id,
        action: payload.action,
        reportId: payload.reportId,
        reason,
      })

      if (moderationResult.error) return moderationResult.error
    }

    const { error: reportUpdateError } = await admin
      .from('reports')
      .update({
        status: 'resolved',
        resolution_action: payload.action,
        resolution_note: reason,
        resolved_by: authUser?.id ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', payload.reportId)

    if (reportUpdateError) {
      return NextResponse.json({ error: '신고 처리 결과를 저장하지 못했습니다' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  if (payload.type === 'moderation-action') {
    const moderationResult = await applyModerationAction({
      admin,
      adminId: authUser?.id ?? '',
      userId: payload.userId,
      action: payload.action,
      reportId: payload.reportId,
      reason: payload.reason,
    })

    if (moderationResult.error) return moderationResult.error

    if (payload.reportId && payload.action !== 'release') {
      const { error: reportUpdateError } = await admin
        .from('reports')
        .update({
          status: 'resolved',
          resolution_action: payload.action,
          resolution_note: moderationResult.reason ?? payload.reason ?? MODERATION_ACTION_LABELS[payload.action],
          resolved_by: authUser?.id ?? null,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', payload.reportId)

      if (reportUpdateError) {
        return NextResponse.json({ error: '신고 상태를 변경하지 못했습니다' }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '지원하지 않는 관리자 작업입니다' }, { status: 400 })
}

export const GET = withAxiomRoute(getDashboard)
export const PATCH = withAxiomRoute(updateDashboard)
