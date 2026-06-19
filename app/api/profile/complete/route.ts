import { NextResponse } from 'next/server'
import { withAxiomRoute } from '@/lib/axiom/server'
import { extractGachonProfileFromMetadata, isGachonEmail } from '@/lib/auth'
import { isAccountNumberCompleteForBank } from '@/lib/banks'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type CompleteProfilePayload = {
  name?: string
  phone?: string
  nickname?: string
  bank_name?: string
  account_number?: string
  account_holder?: string
}

const PHONE_REGEX = /^010-\d{4}-\d{4}$/

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function validatePayload(payload: CompleteProfilePayload | null) {
  const name = cleanText(payload?.name)
  const phone = cleanText(payload?.phone)
  const nickname = cleanText(payload?.nickname)
  const bankName = cleanText(payload?.bank_name)
  const accountNumber = cleanText(payload?.account_number)
  const accountHolder = cleanText(payload?.account_holder)

  if (name.length < 2 || name.length > 100) return { error: '실명을 확인해주세요' }
  if (!PHONE_REGEX.test(phone)) return { error: '전화번호 형식을 확인해주세요' }
  if (nickname.length < 2 || nickname.length > 10) return { error: '닉네임은 2-10자로 입력해주세요' }
  if (!bankName) return { error: '계좌은행명을 선택해주세요' }
  if (!isAccountNumberCompleteForBank(bankName, accountNumber)) return { error: '계좌번호 형식을 확인해주세요' }
  if (accountHolder.length < 2 || accountHolder.length > 100) return { error: '계좌주 이름을 확인해주세요' }

  return {
    data: {
      name,
      phone,
      nickname,
      bankName,
      accountNumber,
      accountHolder,
    },
  }
}

async function completeProfile(request: Request) {
  const supabase = createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  const authUser = data.user

  if (authError || !authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const email = authUser.email
  if (!isGachonEmail(email)) {
    return NextResponse.json({ error: '가천대학교 이메일만 사용할 수 있습니다' }, { status: 403 })
  }

  const payload = await request.json().catch(() => null) as CompleteProfilePayload | null
  const validated = validatePayload(payload)

  if ('error' in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const [existingPrivateResult, existingPayoutResult] = await Promise.all([
    admin
      .from('user_private_profiles')
      .select('user_id')
      .eq('user_id', authUser.id)
      .maybeSingle(),
    admin
      .from('user_payout_accounts')
      .select('user_id')
      .eq('user_id', authUser.id)
      .maybeSingle(),
  ])

  if (existingPrivateResult.error || existingPayoutResult.error) {
    return NextResponse.json({ error: '프로필 상태를 확인하지 못했습니다' }, { status: 500 })
  }

  if (existingPrivateResult.data && existingPayoutResult.data) {
    return NextResponse.json({ error: '이미 프로필 세팅이 완료되었습니다' }, { status: 409 })
  }

  const { data: duplicateNickname, error: duplicateNicknameError } = await admin
    .from('users')
    .select('id')
    .eq('nickname', validated.data.nickname)
    .neq('id', authUser.id)
    .maybeSingle()

  if (duplicateNicknameError) {
    return NextResponse.json({ error: '닉네임 중복을 확인하지 못했습니다' }, { status: 500 })
  }

  if (duplicateNickname) {
    return NextResponse.json({ error: '이미 사용 중인 닉네임입니다' }, { status: 409 })
  }

  const googleProfile = extractGachonProfileFromMetadata(authUser.user_metadata)
  const department = googleProfile.department || '학과 미확인'

  const { error: publicProfileError } = await admin
    .from('users')
    .upsert({
      id: authUser.id,
      nickname: validated.data.nickname,
      department,
    }, { onConflict: 'id' })

  if (publicProfileError) {
    console.error('Public profile creation error:', publicProfileError)
    return NextResponse.json({ error: '공개 프로필을 생성하지 못했습니다' }, { status: 500 })
  }

  const { error: privateProfileError } = await admin
    .from('user_private_profiles')
    .upsert({
      user_id: authUser.id,
      email,
      name: validated.data.name,
      phone: validated.data.phone,
    }, { onConflict: 'user_id' })

  if (privateProfileError) {
    console.error('Private profile creation error:', privateProfileError)
    return NextResponse.json({ error: '비공개 프로필을 생성하지 못했습니다' }, { status: 500 })
  }

  const { error: payoutError } = await admin
    .from('user_payout_accounts')
    .upsert({
      user_id: authUser.id,
      bank_name: validated.data.bankName,
      account_number: validated.data.accountNumber,
      account_holder: validated.data.accountHolder,
    }, { onConflict: 'user_id' })

  if (payoutError) {
    console.error('Payout account creation error:', payoutError)
    return NextResponse.json({ error: '계좌 정보를 저장하지 못했습니다' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export const POST = withAxiomRoute(completeProfile)
