import { NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  AUTH_CALLBACK_ERROR_MESSAGE,
  AUTH_CODE_MISSING_MESSAGE,
  NON_GACHON_ACCOUNT_MESSAGE,
  isGachonEmail,
} from '@/lib/auth'
import { sendWelcomeEmail } from '@/lib/welcome-email'

// 기존 가입자는 이미 이번 환영 메일 발송 대상에 포함됐으므로, 이 시각 이후 새로
// 만들어진 계정에만 자동 메일을 보낸다.
const WELCOME_EMAIL_AUTOMATION_START = new Date('2026-08-03T07:22:07Z')

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

  const user = data.user
  const userCreatedAt = user?.created_at ? new Date(user.created_at) : null
  const alreadySent = Boolean(user?.app_metadata?.gatita_welcome_email_sent_at)

  if (user && user.email && userCreatedAt && userCreatedAt >= WELCOME_EMAIL_AUTOMATION_START && !alreadySent) {
    try {
      const admin = createAdminSupabase()
      const { data: profile, error: profileError } = await admin
        .from('user_private_profiles')
        .select('name, status, is_admin')
        .eq('user_id', user.id)
        .maybeSingle()

      if (profileError) throw profileError

      if (profile?.status === 'active' && !profile.is_admin) {
        const result = await sendWelcomeEmail({
          userId: user.id,
          email: user.email,
          name: profile.name,
        })

        await admin.auth.admin.updateUserById(user.id, {
          app_metadata: {
            ...user.app_metadata,
            gatita_welcome_email_sent_at: new Date().toISOString(),
            gatita_welcome_email_id: result.id,
          },
        })
      }
    } catch (welcomeEmailError) {
      // 가입과 로그인 자체는 이메일 제공자 문제로 막지 않는다.
      console.error('Welcome email send error:', welcomeEmailError)
    }
  }

  return redirectToHome(origin, { auth: 'complete' }, redirectPath)
}
