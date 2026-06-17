import { NextResponse } from 'next/server'
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

const redirectToHome = (origin: string, searchParams?: Record<string, string>) => {
  const url = new URL('/', origin)

  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const origin = getRedirectOrigin(request, requestUrl)
  const code = requestUrl.searchParams.get('code')

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
    await supabase.auth.signOut()
    return redirectToHome(origin, { auth_error: NON_GACHON_ACCOUNT_MESSAGE })
  }

  return redirectToHome(origin, { auth: 'complete' })
}
