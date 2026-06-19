import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

function createAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('관리자 설정이 아직 연결되지 않았습니다')
  }

  return createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
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
  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('id, email, nickname, department, is_admin, status')
    .eq('id', authUser.id)
    .maybeSingle()

  if (profileError) {
    return {
      error: NextResponse.json({ error: '관리자 권한을 확인하지 못했습니다' }, { status: 500 }),
      admin: null,
      authUser,
    }
  }

  if (!profile?.is_admin || profile.status !== 'active') {
    return {
      error: NextResponse.json({ error: '관리자만 접근할 수 있습니다' }, { status: 403 }),
      admin: null,
      authUser,
    }
  }

  return { error: null, admin, authUser, profile }
}

export async function GET(request: Request) {
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
    reportsResult,
    roomsResult,
    messagesResult,
  ] = await Promise.all([
    admin
      .from('users')
      .select('id, email, name, phone, nickname, department, status, is_admin, created_at, updated_at')
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
        created_at,
        reporter:reporter_id(nickname, email, department),
        reported:reported_id(nickname, email, department),
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
  ])

  const firstError = usersResult.error || reportsResult.error || roomsResult.error || messagesResult.error

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

  return NextResponse.json({
    adminUser: profile,
    users: usersResult.data ?? [],
    reports: reportsResult.data ?? [],
    rooms: (roomsResult.data ?? []).map((room) => ({
      ...room,
      creatorPayoutAccount: payoutAccountsByUserId.get(room.created_by) ?? null,
    })),
    messages: messagesResult.data ?? [],
  })
}

export async function PATCH(request: Request) {
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

  const { admin } = adminContext
  const payload = await request.json().catch(() => null) as AdminActionPayload | null

  if (!payload?.type) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다' }, { status: 400 })
  }

  if (payload.type === 'user-status') {
    const { error } = await admin
      .from('users')
      .update({ status: payload.status })
      .eq('id', payload.userId)

    if (error) {
      return NextResponse.json({ error: '사용자 상태를 변경하지 못했습니다' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  if (payload.type === 'report-status') {
    const { error } = await admin
      .from('reports')
      .update({ status: payload.status })
      .eq('id', payload.reportId)

    if (error) {
      return NextResponse.json({ error: '신고 상태를 변경하지 못했습니다' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '지원하지 않는 관리자 작업입니다' }, { status: 400 })
}
