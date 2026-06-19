'use client'

import { useState, useEffect, useCallback, useMemo, useRef, type ChangeEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { PayoutAccount, User } from '@/lib/supabase'
import { isAccountNumberCompleteForBank } from '@/lib/banks'
import { AccountNumberSegmentField, BankSelectField } from '@/components/BankAccountFields'
import { identifyAnalyticsUser, trackEvent } from '@/lib/analytics/client'
import { ArrowLeft, User as UserIcon, AlertCircle, Bug, Camera, Check, Mail, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'

type DeleteStep = 'idle' | 'overview' | 'confirm'
type PayoutAccountForm = Pick<PayoutAccount, 'bank_name' | 'account_number' | 'account_holder'>

const ADMIN_CONTACT_EMAIL = 'ym5373@gachon.ac.kr'
const PROFILE_PHOTO_BUCKET = 'profile-photos'
const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024
const PROFILE_PHOTO_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const DELETE_CONFIRMATION_TEXT = '떠나지 말아주세요. 탈퇴하시는 이유를 여쭤봐도 될까요? 열심히 만들었어요 흑흑'
const EMPTY_PAYOUT_ACCOUNT_FORM: PayoutAccountForm = {
  bank_name: '',
  account_number: '',
  account_holder: '',
}

const createMailHref = (subject: string, body: string) =>
  `mailto:${ADMIN_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [newNickname, setNewNickname] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [nicknameError, setNicknameError] = useState('')
  const [isSavingPhoto, setIsSavingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccount | null>(null)
  const [accountForm, setAccountForm] = useState<PayoutAccountForm>(EMPTY_PAYOUT_ACCOUNT_FORM)
  const [accountError, setAccountError] = useState('')
  const [isSavingAccount, setIsSavingAccount] = useState(false)
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('idle')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const checkAuthAndLoadData = useCallback(async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      
      if (!authUser) {
        router.push('/')
        return
      }

      const profileResponse = await fetch('/api/profile/me')
      const profileResult = await profileResponse.json().catch(() => null) as {
        profileCompleted?: boolean
        user?: User | null
        payoutAccount?: PayoutAccount | null
        error?: string
      } | null
      
      if (!profileResponse.ok) {
        throw new Error(profileResult?.error ?? '프로필을 불러오지 못했습니다')
      }

      const userData = profileResult?.user

      if (profileResult?.profileCompleted && userData) {
        setUser(userData)
        identifyAnalyticsUser(userData.id, {
          profile_completed: true,
          is_admin: userData.is_admin,
          account_status: userData.status,
          department: userData.department,
        })
        setNewNickname(userData.nickname)

        const payoutData = profileResult.payoutAccount

        if (payoutData) {
          setPayoutAccount(payoutData)
          setAccountForm({
            bank_name: payoutData.bank_name,
            account_number: payoutData.account_number,
            account_holder: payoutData.account_holder,
          })
        } else {
          setPayoutAccount(null)
          setAccountForm(EMPTY_PAYOUT_ACCOUNT_FORM)
        }
      } else {
        router.push('/')
      }
    } catch (error) {
      console.error('Auth/data loading error:', error)
      router.push('/')
    } finally {
      setLoading(false)
    }
  }, [router, supabase])

  useEffect(() => {
    checkAuthAndLoadData()
  }, [checkAuthAndLoadData])

  const canChangeNickname = (lastUpdated?: string) => {
    if (!lastUpdated) return true // 한 번도 변경한 적 없으면 가능
    
    const twoWeeksAgo = new Date()
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
    
    return new Date(lastUpdated) <= twoWeeksAgo
  }

  const getNextChangeDate = (lastUpdated?: string) => {
    if (!lastUpdated) return null
    
    const nextChangeDate = new Date(lastUpdated)
    nextChangeDate.setDate(nextChangeDate.getDate() + 14)
    
    return nextChangeDate
  }

  const handleNicknameChange = async () => {
    if (!user || !newNickname.trim()) return

    // 유효성 검사
    if (newNickname.length < 2 || newNickname.length > 10) {
      setNicknameError('닉네임은 2-10자로 입력해주세요')
      return
    }

    if (newNickname === user.nickname) {
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    setNicknameError('')

    try {
      // 닉네임 중복 확인
      const { data: existingUser } = await supabase
        .from('users')
        .select('nickname')
        .eq('nickname', newNickname.trim())
        .neq('id', user.id)
        .maybeSingle()

      if (existingUser) {
        setNicknameError('이미 사용 중인 닉네임입니다')
        setIsSaving(false)
        return
      }

      // 닉네임 변경
      const { error } = await supabase
        .from('users')
        .update({ 
          nickname: newNickname.trim(),
          nickname_updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (error) throw error

      // 사용자 정보 업데이트
      setUser(prev => prev ? {
        ...prev,
        nickname: newNickname.trim(),
        nickname_updated_at: new Date().toISOString()
      } : null)

      setIsEditing(false)
      trackEvent('profile_updated', {
        field: 'nickname',
      })
      toast.success('닉네임이 변경되었습니다')
    } catch (error) {
      console.error('Nickname change error:', error)
      toast.error('닉네임 변경 중 오류가 발생했습니다')
    } finally {
      setIsSaving(false)
    }
  }

  const handleProfilePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file || !user) return

    const extension = PROFILE_PHOTO_EXTENSIONS[file.type]

    if (!extension) {
      setPhotoError('JPG, PNG, WEBP 이미지만 등록할 수 있습니다')
      return
    }

    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      setPhotoError('프로필 사진은 2MB 이하로 등록해주세요')
      return
    }

    setIsSavingPhoto(true)
    setPhotoError('')

    try {
      const filePath = `${user.id}/avatar.${extension}`
      const { error: uploadError } = await supabase.storage.from(PROFILE_PHOTO_BUCKET).upload(filePath, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: '60',
      })

      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage.from(PROFILE_PHOTO_BUCKET).getPublicUrl(filePath)
      const nextAvatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`
      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: nextAvatarUrl })
        .eq('id', user.id)

      if (updateError) throw updateError

      setUser(prev => prev ? { ...prev, avatar_url: nextAvatarUrl } : prev)
      trackEvent('profile_updated', {
        field: 'avatar_url',
      })
      toast.success('프로필 사진이 저장되었습니다')
    } catch (error) {
      console.error('Profile photo save error:', error)
      setPhotoError('프로필 사진 저장 중 오류가 발생했습니다')
      toast.error('프로필 사진 저장 중 오류가 발생했습니다')
    } finally {
      setIsSavingPhoto(false)
    }
  }

  const handleAccountFieldChange = (field: keyof PayoutAccountForm, value: string) => {
    setAccountForm(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'bank_name' ? { account_number: '' } : {}),
    }))
    setAccountError('')
  }

  const handlePayoutAccountSave = async () => {
    if (!user) return

    const nextAccount = {
      bank_name: accountForm.bank_name.trim(),
      account_number: accountForm.account_number.trim(),
      account_holder: accountForm.account_holder.trim(),
    }

    if (!nextAccount.bank_name || !nextAccount.account_number || !nextAccount.account_holder) {
      setAccountError('은행명, 계좌번호, 계좌주 이름을 모두 입력해주세요')
      return
    }

    if (!isAccountNumberCompleteForBank(nextAccount.bank_name, nextAccount.account_number)) {
      setAccountError('선택한 은행의 계좌번호 형식에 맞게 입력해주세요')
      return
    }

    setIsSavingAccount(true)
    setAccountError('')

    try {
      const { data, error } = await supabase
        .from('user_payout_accounts')
        .upsert({
          user_id: user.id,
          ...nextAccount,
        }, { onConflict: 'user_id' })
        .select('user_id, bank_name, account_number, account_holder, created_at, updated_at')
        .single()

      if (error) throw error

      setPayoutAccount(data)
      setAccountForm({
        bank_name: data.bank_name,
        account_number: data.account_number,
        account_holder: data.account_holder,
      })
      trackEvent('payout_account_updated', {
        bank_name: data.bank_name,
      })
      toast.success('계좌 정보가 저장되었습니다')
    } catch (error) {
      console.error('Payout account save error:', error)
      toast.error('계좌 정보 저장 중 오류가 발생했습니다')
    } finally {
      setIsSavingAccount(false)
    }
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      identifyAnalyticsUser(null)
      trackEvent('logout_completed', {
        source: 'settings',
      })
      router.push('/')
      toast.success('로그아웃되었습니다')
    } catch (error) {
      toast.error('로그아웃 중 오류가 발생했습니다')
    }
  }

  const closeDeleteFlow = () => {
    if (isDeleting) return

    setDeleteStep('idle')
    setDeleteConfirmText('')
    setDeleteAcknowledged(false)
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim() !== DELETE_CONFIRMATION_TEXT || !deleteAcknowledged) return

    setIsDeleting(true)
    trackEvent('account_delete_submitted', {
      source: 'settings',
    })

    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmation: DELETE_CONFIRMATION_TEXT }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error ?? '계정을 삭제하지 못했습니다')
      }

      await supabase.auth.signOut()
      identifyAnalyticsUser(null)
      trackEvent('account_deleted', {
        source: 'settings',
      })
      toast.success('계정이 탈퇴 처리되었습니다')
      router.push('/')
    } catch (error) {
      console.error('Delete account error:', error)
      toast.error(error instanceof Error ? error.message : '계정 탈퇴 중 오류가 발생했습니다')
    } finally {
      setIsDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (!user) return null

  const nicknameUpdatedAt = user.nickname_updated_at ?? undefined
  const canChange = canChangeNickname(nicknameUpdatedAt)
  const nextChangeDate = getNextChangeDate(nicknameUpdatedAt)
  const canDeleteAccount = deleteConfirmText.trim() === DELETE_CONFIRMATION_TEXT && deleteAcknowledged
  const contactMailHref = createMailHref(
    '[같이타] 문의하기',
    '문의 내용을 적어주세요.\n\n',
  )
  const bugReportMailHref = createMailHref(
    '[같이타] 버그 제보',
    '발생한 문제와 사용 환경을 적어주세요.\n\n1. 어떤 화면에서 발생했나요?\n2. 어떤 동작을 했나요?\n3. 기대한 동작은 무엇인가요?\n',
  )

  return (
    <div className="min-h-screen app-bg">
      {/* Header */}
      <header
        className="app-header px-4 pb-4"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center">
          <button
            onClick={() => router.push('/map')}
            className="p-2 mr-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">설정</h1>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* 프로필 정보 */}
        <div className="card p-6 mb-6">
          <div className="mb-6 flex items-center">
            <div className="mr-4 flex flex-col items-center gap-2">
              <div
                className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white"
                style={{ backgroundImage: user.avatar_url ? undefined : 'var(--brand-gradient)', boxShadow: '0 8px 20px rgba(39, 130, 255, 0.28)' }}
              >
                {user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserIcon className="h-8 w-8 text-white" />
                )}
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleProfilePhotoChange}
              />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={isSavingPhoto}
                className="inline-flex items-center rounded-full border border-primary-100 bg-primary-50 px-2.5 py-1 text-[11px] font-bold text-primary-700 transition hover:bg-primary-100 disabled:bg-gray-100 disabled:text-gray-400"
              >
                <Camera className="mr-1 h-3 w-3" />
                {isSavingPhoto ? '저장 중' : user.avatar_url ? '사진 변경' : '프로필 사진 등록'}
              </button>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{user.nickname}</h2>
              <p className="text-gray-600">{user.department}</p>
              {photoError && (
                <p className="mt-2 text-xs font-semibold text-red-500">{photoError}</p>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {/* 실명 (변경 불가) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                실명
              </label>
              <input
                type="text"
                value={user.name}
                disabled
                className="input-field bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                실명은 변경할 수 없습니다
              </p>
            </div>

            {/* 이메일 (변경 불가) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                이메일
              </label>
              <input
                type="email"
                value={user.email}
                disabled
                className="input-field bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                이메일은 변경할 수 없습니다
              </p>
            </div>

            {/* 전화번호 (변경 불가) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                전화번호
              </label>
              <input
                type="tel"
                value={user.phone}
                disabled
                className="input-field bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                전화번호는 변경할 수 없습니다
              </p>
            </div>

            {/* 닉네임 (변경 가능, 제한 있음) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                닉네임
              </label>
              {isEditing ? (
                <div>
                  <input
                    type="text"
                    value={newNickname}
                    onChange={(e) => {
                      setNewNickname(e.target.value)
                      setNicknameError('')
                    }}
                    className={`input-field ${nicknameError ? 'border-red-500' : ''}`}
                    placeholder="새 닉네임을 입력하세요"
                    maxLength={10}
                  />
                  {nicknameError && (
                    <div className="flex items-center mt-2 text-red-500 text-sm">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      {nicknameError}
                    </div>
                  )}
                  <div className="flex space-x-2 mt-3">
                    <button
                      onClick={handleNicknameChange}
                      disabled={isSaving || !newNickname.trim()}
                      className="btn-primary text-sm px-4 py-2 flex items-center"
                    >
                      {isSaving ? (
                        <>
                          <div className="loading-spinner mr-2" />
                          저장 중...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          저장
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditing(false)
                        setNewNickname(user.nickname)
                        setNicknameError('')
                      }}
                      className="btn-secondary text-sm px-4 py-2"
                      disabled={isSaving}
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={user.nickname}
                      disabled
                      className="input-field bg-gray-50 text-gray-500 cursor-not-allowed flex-1 mr-3"
                    />
                    <button
                      onClick={() => setIsEditing(true)}
                      disabled={!canChange}
                      className={`px-4 py-2 text-sm font-medium rounded-lg ${
                        canChange 
                          ? 'bg-primary-600 hover:bg-primary-700 text-white' 
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      변경
                    </button>
                  </div>
                  
                  {!canChange && nextChangeDate && (
                    <div className="flex items-center mt-2 text-red-500 text-sm">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      {nextChangeDate.toLocaleDateString('ko-KR')} 이후 변경 가능합니다
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-500 mt-1">
                    변경 후 2주간 재변경 불가
                  </p>
                </div>
              )}
            </div>

            {/* 학과 (변경 불가) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                학과
              </label>
              <input
                type="text"
                value={user.department}
                disabled
                className="input-field bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                학과는 가입 후 변경할 수 없습니다
              </p>
            </div>
          </div>
        </div>

        {/* 계좌 정보 */}
        <div className="card p-6 mb-6">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-gray-900">계좌 정보</h3>
            <p className="mt-1 text-sm text-gray-600">
              내가 만든 방에서는 방장 계좌로 참여자에게 공개됩니다.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                계좌은행명
              </label>
              <BankSelectField
                value={accountForm.bank_name}
                onChange={(value) => handleAccountFieldChange('bank_name', value)}
                disabled={isSavingAccount}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                계좌번호
              </label>
              <AccountNumberSegmentField
                bankName={accountForm.bank_name}
                value={accountForm.account_number}
                onChange={(value) => handleAccountFieldChange('account_number', value)}
                disabled={isSavingAccount}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                계좌주 이름
              </label>
              <input
                type="text"
                value={accountForm.account_holder}
                onChange={(event) => handleAccountFieldChange('account_holder', event.target.value)}
                className="input-field"
                placeholder="계좌주 이름을 입력하세요"
                disabled={isSavingAccount}
              />
            </div>

            {accountError && (
              <div className="flex items-center text-sm text-red-500">
                <AlertCircle className="w-4 h-4 mr-1" />
                {accountError}
              </div>
            )}

            <button
              type="button"
              onClick={handlePayoutAccountSave}
              disabled={isSavingAccount}
              className="btn-primary w-full py-3 text-sm"
            >
              {isSavingAccount ? (
                <span className="inline-flex items-center justify-center">
                  <span className="loading-spinner mr-2" />
                  저장 중...
                </span>
              ) : payoutAccount ? (
                '계좌 정보 수정'
              ) : (
                '계좌 정보 저장'
              )}
            </button>
          </div>
        </div>

        {/* 관리자 문의 */}
        <div className="card p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">관리자 문의</h3>
          <div>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={contactMailHref}
                className="inline-flex items-center justify-center rounded-xl border border-primary-100 bg-primary-50 px-3 py-3 text-sm font-bold text-primary-700 transition hover:bg-primary-100"
              >
                <Mail className="mr-2 h-4 w-4" />
                문의하기
              </a>
              <a
                href={bugReportMailHref}
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-bold text-gray-800 transition hover:bg-gray-50"
              >
                <Bug className="mr-2 h-4 w-4" />
                버그 제보
              </a>
            </div>
          </div>
        </div>

        {/* 로그아웃 버튼 */}
        <div className="card p-6">
          <button
            onClick={handleLogout}
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors"
          >
            로그아웃
          </button>
        </div>

        {/* 하단 정보 */}
        <div className="text-center text-sm text-gray-500 mt-8">
          <p>같이타 v1.0.0</p>
          <p className="mt-2">가천대 통학 동행 플랫폼</p>
          <div className="mt-4 flex items-center justify-center gap-4 text-xs">
            <Link href="/privacy" className="underline hover:text-gray-700">
              개인정보처리방침
            </Link>
            <Link href="/terms" className="underline hover:text-gray-700">
              서비스약관
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setDeleteStep('overview')}
            className="mt-6 text-[11px] font-medium text-gray-400 underline decoration-gray-300 underline-offset-2 transition hover:text-red-600 hover:decoration-red-300"
          >
            탈퇴하기
          </button>
        </div>
      </div>

      {deleteStep !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-4 pb-4 pt-16 sm:items-center sm:pb-16">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-red-600">계정 탈퇴</p>
                <h2 className="mt-1 text-lg font-extrabold text-gray-950">
                  {deleteStep === 'overview' ? '정말 탈퇴하시겠어요?' : '마지막 확인'}
                </h2>
              </div>
              <button
                type="button"
                aria-label="탈퇴 화면 닫기"
                onClick={closeDeleteFlow}
                disabled={isDeleting}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {deleteStep === 'overview' ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg bg-red-50 px-3 py-3 text-sm leading-6 text-red-900">
                  탈퇴하면 프로필, 참여 기록, 내가 만든 방, 메시지, 즐겨찾기 정보가 삭제됩니다. 삭제된 계정은 복구할 수 없습니다.
                </div>
                <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-gray-600">
                  <li>진행 중인 채팅방 참여가 해제됩니다.</li>
                  <li>내가 만든 활성 방은 함께 정리될 수 있습니다.</li>
                  <li>신고 및 안전 처리를 위해 필요한 기록은 운영상 필요한 기간 동안 보관될 수 있습니다.</li>
                </ul>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeDeleteFlow}
                    className="btn-secondary flex-1 py-2.5 text-sm"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteStep('confirm')}
                    className="inline-flex flex-1 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-100"
                  >
                    계속
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-800">
                    아래 문구를 정확히 입력해주세요: {DELETE_CONFIRMATION_TEXT}
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(event) => setDeleteConfirmText(event.target.value)}
                    className="input-field"
                    autoComplete="off"
                    disabled={isDeleting}
                  />
                </div>
                <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm leading-5 text-gray-700">
                  <input
                    type="checkbox"
                    checked={deleteAcknowledged}
                    onChange={(event) => setDeleteAcknowledged(event.target.checked)}
                    disabled={isDeleting}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-red-600 focus:ring-red-200"
                  />
                  <span>삭제 후 계정과 서비스 기록을 복구할 수 없다는 점을 이해했습니다.</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteStep('overview')}
                    disabled={isDeleting}
                    className="btn-secondary flex-1 py-2.5 text-sm"
                  >
                    이전
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={
                      isDeleting ||
                      !canDeleteAccount
                    }
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:bg-gray-300"
                  >
                    {isDeleting ? (
                      <>
                        <div className="loading-spinner mr-2" />
                        처리 중
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        탈퇴하기
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
