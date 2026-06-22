import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { isAccountNumberCompleteForBank } from '@/lib/banks'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type PayoutPayload = {
  bank_name?: string
  account_number?: string
  account_holder?: string
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function updatePayout(request: Request) {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const authUser = data.user

  if (authError || !authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const payload = (await request.json().catch(() => null)) as PayoutPayload | null
  const bankName = cleanText(payload?.bank_name)
  const accountNumber = cleanText(payload?.account_number)
  const accountHolder = cleanText(payload?.account_holder)

  if (!bankName || !accountNumber || !accountHolder) {
    return NextResponse.json({ error: '은행명, 계좌번호, 계좌주 이름을 모두 입력해주세요' }, { status: 400 })
  }
  if (!isAccountNumberCompleteForBank(bankName, accountNumber)) {
    return NextResponse.json({ error: '선택한 은행의 계좌번호 형식에 맞게 입력해주세요' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const { data: updated, error } = await admin
    .from('user_private_profiles')
    .update({
      bank_name: bankName,
      account_number: accountNumber,
      account_holder: accountHolder,
    })
    .eq('user_id', authUser.id)
    .select('user_id, bank_name, account_number, account_holder, created_at, updated_at')
    .single()

  if (error) {
    console.error('Payout update error:', error)
    return NextResponse.json({ error: '계좌 정보 저장 중 오류가 발생했습니다' }, { status: 500 })
  }

  return NextResponse.json({ payoutAccount: updated })
}

export const PATCH = withAxiomRoute(updatePayout)
