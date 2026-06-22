import { NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  AUTH_CALLBACK_ERROR_MESSAGE,
  AUTH_CODE_MISSING_MESSAGE,
  NON_GACHON_ACCOUNT_MESSAGE,
  isGachonEmail,
} from '@/lib/auth'

const getRedirectOrigin = (request: Request, requestUrl: URL) => {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'

  if (process.env.NODE_ENV !== 'development' && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }

  return requestUrl.origin
}

const redirectToHome = (origin: string, searchParams?: Record<string, string>, redirectPath?: string | null) => {
  const isSafeRedirectPath = redirectPath?.startsWith('/') && !redirectPath.startsWith('//')
  const destinationPath = isSafeRedirectPath && redirectPath ? redirectPath : '/'
  const url = new URL(destinationPath, origin)

  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const origin = getRedirectOrigin(request, requestUrl)
  const code = requestUrl.searchParams.get('code')
  const redirectPath = requestUrl.searchParams.get('redirect')

  if (!code) {
    return redirectToHome(origin, { auth_error: AUTH_CODE_MISSING_MESSAGE })
  }

  const supabase = createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('Supabase OAuth callback error:', error.message)
    return redirectToHome(origin, { auth_error: AUTH_CALLBACK_ERROR_MESSAGE })
  }

  if (!isGachonEmail(data.user?.email)) {
    const nonGachonUserId = data.user?.id
    await supabase.auth.signOut()
    if (nonGachonUserId) {
      try {
        await createAdminSupabase().auth.admin.deleteUser(nonGachonUserId)
      } catch (deleteError) {
        console.error('Failed to delete non-gachon auth user:', deleteError)
      }
    }
    return redirectToHome(origin, { auth_error: NON_GACHON_ACCOUNT_MESSAGE })
  }

  return redirectToHome(origin, { auth: 'complete' }, redirectPath)
}
