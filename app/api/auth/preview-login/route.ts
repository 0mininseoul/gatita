import { NextResponse } from 'next/server'
import { getPreviewTestAccount } from '@/lib/previewTestAccounts'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function isServerPreviewLoginEnabled() {
  return process.env.ENABLE_PREVIEW_TEST_LOGIN === 'true' && process.env.VERCEL_ENV !== 'production'
}

export async function POST(request: Request) {
  if (!isServerPreviewLoginEnabled()) {
    return NextResponse.json({ error: '프리뷰 계정 로그인이 비활성화되어 있습니다' }, { status: 404 })
  }

  const payload = await request.json().catch(() => null) as { accountKey?: unknown } | null
  const accountKey = typeof payload?.accountKey === 'string' ? payload.accountKey : ''
  const account = getPreviewTestAccount(accountKey)

  if (!account) {
    return NextResponse.json({ error: '알 수 없는 프리뷰 계정입니다' }, { status: 400 })
  }

  const password = process.env.PREVIEW_TEST_ACCOUNT_PASSWORD
  if (!password) {
    return NextResponse.json({ error: '프리뷰 계정 비밀번호가 설정되지 않았습니다' }, { status: 500 })
  }

  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: account.email,
    password,
  })

  if (error) {
    console.error('Preview account login failed:', {
      accountKey: account.key,
      message: error.message,
    })
    return NextResponse.json({ error: '프리뷰 계정 로그인에 실패했습니다' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
