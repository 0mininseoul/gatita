import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ADMIN_USER_ID = '5a018580-6558-44fc-a621-1fa2506e9d5e'

type LocationSheetPayload = {
  from_location?: unknown
}

function normalizeLocation(value: unknown) {
  if (typeof value !== 'string') return null
  const location = value.trim()
  return location ? location.slice(0, 50) : null
}

async function recordLocationSheetView(request: Request) {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const authUser = data.user

  if (authError || !authUser || authUser.id === ADMIN_USER_ID) {
    return new NextResponse(null, { status: 204 })
  }

  const payload = await request.json().catch(() => null) as LocationSheetPayload | null
  const fromLocation = normalizeLocation(payload?.from_location)

  if (!fromLocation) {
    return new NextResponse(null, { status: 204 })
  }

  const admin = createAdminSupabase()
  const { data: profile, error: profileError } = await admin
    .from('user_private_profiles')
    .select('is_admin')
    .eq('user_id', authUser.id)
    .maybeSingle()

  if (profileError || profile?.is_admin) {
    return new NextResponse(null, { status: 204 })
  }

  const { error: insertError } = await admin
    .from('location_sheet_view_events')
    .insert({
      user_id: authUser.id,
      from_location: fromLocation,
    })

  if (insertError) {
    console.error('Location sheet tracking insert error:', insertError)
  }

  return new NextResponse(null, { status: 204 })
}

export const POST = withAxiomRoute(recordLocationSheetView)
