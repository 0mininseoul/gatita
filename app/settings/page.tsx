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
const PROFILE_PHOTO_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
const PROFILE_PHOTO_STORAGE_MAX_BYTES = 2 * 1024 * 1024
const PROFILE_PHOTO_MAX_DIMENSION = 1024
const PROFILE_PHOTO_QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52, 0.44, 0.36]
const PROFILE_PHOTO_DIMENSION_STEPS = [1, 0.85, 0.7, 0.56]
const PROFILE_PHOTO_COMPRESSED_CONTENT_TYPE = 'image/webp'
const PROFILE_PHOTO_FALLBACK_CONTENT_TYPE = 'image/jpeg'
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

const loadProfilePhotoImage = (objectUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('이미지를 불러오지 못했습니다'))
    image.src = objectUrl
  })

const encodeCanvas = (canvas: HTMLCanvasElement, contentType: string, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('이미지를 압축하지 못했습니다'))
        return
      }

      resolve(blob)
    }, contentType, quality)
  })

const createCompressedFile = (source: File, blob: Blob, contentType: string) => {
  const extension = PROFILE_PHOTO_EXTENSIONS[contentType] ?? 'jpg'
  const baseName = source.name.replace(/\.[^.]+$/, '') || 'avatar'

  return {
    file: new File([blob], `${baseName}.${extension}`, {
      type: contentType,
      lastModified: Date.now(),
    }),
    contentType,
    extension,
  }
}

const compressProfilePhoto = async (file: File, previewUrl: string) => {
  if (file.size <= PROFILE_PHOTO_STORAGE_MAX_BYTES) {
    return createCompressedFile(file, file, file.type)
  }

  const image = await loadProfilePhotoImage(previewUrl)
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height

  if (!sourceWidth || !sourceHeight) {
    throw new Error('이미지 크기를 확인하지 못했습니다')
  }

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('이미지를 압축할 수 없는 브라우저입니다')
  }

  for (const dimensionStep of PROFILE_PHOTO_DIMENSION_STEPS) {
    const dimensionLimit = PROFILE_PHOTO_MAX_DIMENSION * dimensionStep
    const scale = Math.min(1, dimensionLimit / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))

    canvas.width = width
    canvas.height = height
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    for (const quality of PROFILE_PHOTO_QUALITY_STEPS) {
      let blob: Blob
      let contentType = PROFILE_PHOTO_COMPRESSED_CONTENT_TYPE

      try {
        blob = await encodeCanvas(canvas, PROFILE_PHOTO_COMPRESSED_CONTENT_TYPE, quality)
        if (blob.type !== PROFILE_PHOTO_COMPRESSED_CONTENT_TYPE) {
          blob = await encodeCanvas(canvas, PROFILE_PHOTO_FALLBACK_CONTENT_TYPE, quality)
          contentType = PROFILE_PHOTO_FALLBACK_CONTENT_TYPE
        }
      } catch {
        blob = await encodeCanvas(canvas, PROFILE_PHOTO_FALLBACK_CONTENT_TYPE, quality)
        contentType = PROFILE_PHOTO_FALLBACK_CONTENT_TYPE
      }

      if (blob.size <= PROFILE_PHOTO_STORAGE_MAX_BYTES) {
        return createCompressedFile(file, blob, contentType)
      }
    }
  }

  throw new Error('이미지를 2MB 이하로 압축하지 못했습니다')
}

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
  const persistedAvatarUrlRef = useRef<string | null>(null)
  const photoPreviewUrlRef = useRef<string | null>(null)
  const photoUploadIdRef = useRef(0)
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
        persistedAvatarUrlRef.current = userData.avatar_url ?? null
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

  useEffect(() => {
    return () => {
      if (photoPreviewUrlRef.current) {
        URL.revokeObjectURL(photoPreviewUrlRef.current)
      }
    }
  }, [])

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

    const isSupportedImage = Boolean(PROFILE_PHOTO_EXTENSIONS[file.type])

    if (!isSupportedImage) {
      setPhotoError('JPG, PNG, WEBP 이미지만 등록할 수 있습니다')
      return
    }

    if (file.size > PROFILE_PHOTO_UPLOAD_MAX_BYTES) {
      setPhotoError('프로필 사진은 10MB 이하로 등록해주세요')
      return
    }

    const uploadId = photoUploadIdRef.current + 1
    const previewUrl = URL.createObjectURL(file)
    const previousAvatarUrl = persistedAvatarUrlRef.current
    photoUploadIdRef.current = uploadId

    if (photoPreviewUrlRef.current) {
      URL.revokeObjectURL(photoPreviewUrlRef.current)
    }

    photoPreviewUrlRef.current = previewUrl
    setUser(prev => prev ? { ...prev, avatar_url: previewUrl } : prev)
    setIsSavingPhoto(true)
    setPhotoError('')

    try {
      const compressedProfilePhoto = await compressProfilePhoto(file, previewUrl)
      if (photoUploadIdRef.current !== uploadId) return

      const filePath = `${user.id}/avatar.${compressedProfilePhoto.extension}`
      const { error: uploadError } = await supabase.storage.from(PROFILE_PHOTO_BUCKET).upload(filePath, compressedProfilePhoto.file, {
        upsert: true,
        contentType: compressedProfilePhoto.contentType,
        cacheControl: '60',
      })

      if (uploadError) throw uploadError
      if (photoUploadIdRef.current !== uploadId) return

      const { data: publicUrlData } = supabase.storage.from(PROFILE_PHOTO_BUCKET).getPublicUrl(filePath)
      const nextAvatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`
      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: nextAvatarUrl })
        .eq('id', user.id)

      if (updateError) throw updateError

      if (photoUploadIdRef.current === uploadId) {
        persistedAvatarUrlRef.current = nextAvatarUrl
        setUser(prev => prev ? { ...prev, avatar_url: nextAvatarUrl } : prev)
      }
      trackEvent('profile_updated', {
        field: 'avatar_url',
      })
      toast.success('프로필 사진이 저장되었습니다')
    } catch (error) {
      console.error('Profile photo save error:', error)
      if (photoUploadIdRef.current === uploadId) {
        setUser(prev => prev ? { ...prev, avatar_url: previousAvatarUrl } : prev)
        setPhotoError(error instanceof Error ? error.message : '프로필 사진 저장 중 오류가 발생했습니다')
      }
      toast.error(error instanceof Error ? error.message : '프로필 사진 저장 중 오류가 발생했습니다')
    } finally {
      if (photoUploadIdRef.current === uploadId) {
        setIsSavingPhoto(false)
        if (photoPreviewUrlRef.current === previewUrl) {
          URL.revokeObjectURL(previewUrl)
          photoPreviewUrlRef.current = null
        }
      } else {
        URL.revokeObjectURL(previewUrl)
      }
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
  const profileRows = [
    { label: '실명', value: user.name },
    { label: '이메일', value: user.email },
    { label: '전화번호', value: user.phone },
    { label: '학과', value: user.department },
  ]

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

      <main className="settings-shell">
        <section className="settings-hero" aria-labelledby="settings-profile-title">
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label={user.avatar_url ? '프로필 사진 변경' : '프로필 사진 등록'}
              onClick={() => photoInputRef.current?.click()}
              disabled={isSavingPhoto}
              className="settings-avatar"
              style={{ backgroundImage: user.avatar_url ? undefined : 'var(--brand-gradient)' }}
            >
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserIcon className="h-6 w-6 text-white" />
              )}
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleProfilePhotoChange}
            />
            <button
              type="button"
              aria-label={user.avatar_url ? '프로필 사진 변경' : '프로필 사진 등록'}
              onClick={() => photoInputRef.current?.click()}
              disabled={isSavingPhoto}
              className="settings-avatar-button"
            >
              {isSavingPhoto ? <span className="loading-spinner h-3.5 w-3.5 border" /> : <Camera className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <p className="settings-kicker">프로필 요약</p>
            <h2 id="settings-profile-title" className="truncate text-[1.15rem] font-extrabold leading-tight text-gray-950">
              {user.nickname}
            </h2>
            <p className="mt-0.5 truncate text-xs font-medium text-gray-500">{user.department}</p>
            {photoError && (
              <p className="mt-1 text-[11px] font-semibold text-red-500">{photoError}</p>
            )}
          </div>
        </section>

        <section className="settings-section" aria-labelledby="settings-profile-info">
          <div className="settings-section-heading">
            <h3 id="settings-profile-info">기본 정보</h3>
            <p>동행 확인에 필요한 정보입니다</p>
          </div>
          <div className="settings-list">
            {profileRows.map((row) => (
              <div key={row.label} className="settings-row">
                <div className="min-w-0">
                  <p className="settings-row-label">{row.label}</p>
                </div>
                <span className="settings-row-value">{row.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="settings-section" aria-labelledby="settings-nickname">
          <div className="settings-section-heading settings-section-heading-row">
            <div>
              <h3 id="settings-nickname">닉네임</h3>
              <p>변경 후 2주간 재변경할 수 없습니다</p>
            </div>
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                disabled={!canChange}
                className="settings-mini-button"
              >
                변경
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <input
                type="text"
                value={newNickname}
                onChange={(e) => {
                  setNewNickname(e.target.value)
                  setNicknameError('')
                }}
                className={`input-field settings-input ${nicknameError ? 'border-red-500' : ''}`}
                placeholder="새 닉네임"
                maxLength={10}
              />
              {nicknameError && (
                <div className="settings-error">
                  <AlertCircle className="h-4 w-4" />
                  {nicknameError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleNicknameChange}
                  disabled={isSaving || !newNickname.trim()}
                  className="btn-primary settings-save-button"
                >
                  {isSaving ? (
                    <span className="inline-flex items-center justify-center">
                      <span className="loading-spinner mr-2 h-4 w-4" />
                      저장 중
                    </span>
                  ) : (
                    <>
                      <Check className="mr-1.5 h-4 w-4" />
                      저장
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false)
                    setNewNickname(user.nickname)
                    setNicknameError('')
                  }}
                  className="btn-secondary settings-save-button"
                  disabled={isSaving}
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="settings-row settings-row-standalone">
                <p className="settings-row-label">현재 닉네임</p>
                <span className="settings-row-value">{user.nickname}</span>
              </div>
              {!canChange && nextChangeDate && (
                <div className="settings-error mt-2">
                  <AlertCircle className="h-4 w-4" />
                  {nextChangeDate.toLocaleDateString('ko-KR')} 이후 변경 가능합니다
                </div>
              )}
            </div>
          )}
        </section>

        <section className="settings-section" aria-labelledby="settings-payout">
          <div className="settings-section-heading">
            <h3 id="settings-payout">정산 계좌</h3>
            <p>방을 개설하면 같은 방 참여자에게 공개될 수 있습니다</p>
          </div>

          <div className="settings-field-stack">
            <div>
              <p className="settings-field-label">은행</p>
              <BankSelectField
                value={accountForm.bank_name}
                onChange={(value) => handleAccountFieldChange('bank_name', value)}
                disabled={isSavingAccount}
              />
            </div>
            <div>
              <p className="settings-field-label">계좌번호</p>
              <AccountNumberSegmentField
                bankName={accountForm.bank_name}
                value={accountForm.account_number}
                onChange={(value) => handleAccountFieldChange('account_number', value)}
                disabled={isSavingAccount}
              />
            </div>
            <div>
              <label className="settings-field-label" htmlFor="settings-account-holder">계좌주</label>
              <input
                id="settings-account-holder"
                type="text"
                value={accountForm.account_holder}
                onChange={(event) => handleAccountFieldChange('account_holder', event.target.value)}
                className="input-field settings-input"
                placeholder="계좌주 이름"
                disabled={isSavingAccount}
              />
            </div>

            {accountError && (
              <div className="settings-error">
                <AlertCircle className="h-4 w-4" />
                {accountError}
              </div>
            )}

            <button
              type="button"
              onClick={handlePayoutAccountSave}
              disabled={isSavingAccount}
              className="btn-primary settings-save-button w-full"
            >
              {isSavingAccount ? (
                <span className="inline-flex items-center justify-center">
                  <span className="loading-spinner mr-2 h-4 w-4" />
                  저장 중
                </span>
              ) : payoutAccount ? (
                '계좌 정보 수정'
              ) : (
                '계좌 정보 저장'
              )}
            </button>
          </div>
        </section>

        <section className="settings-section settings-section-tight" aria-labelledby="settings-contact">
          <div className="settings-section-heading">
            <h3 id="settings-contact">관리자 문의</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a href={contactMailHref} className="settings-action-row settings-action-row-primary">
              <Mail className="h-4 w-4" />
              문의하기
            </a>
            <a href={bugReportMailHref} className="settings-action-row">
              <Bug className="h-4 w-4" />
              버그 제보
            </a>
          </div>
        </section>

        <section className="settings-section settings-section-tight">
          <button
            type="button"
            onClick={handleLogout}
            className="settings-danger-row"
          >
            로그아웃
          </button>
        </section>

        <footer className="settings-footer">
          <p>같이타 v1.0.0</p>
          <div className="mt-3 flex items-center justify-center gap-4">
            <Link href="/privacy" className="underline underline-offset-2 hover:text-gray-700">
              개인정보처리방침
            </Link>
            <Link href="/terms" className="underline underline-offset-2 hover:text-gray-700">
              서비스약관
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setDeleteStep('overview')}
            className="mt-5 text-[11px] font-medium text-gray-400 underline decoration-gray-300 underline-offset-2 transition hover:text-red-600 hover:decoration-red-300"
          >
            탈퇴하기
          </button>
        </footer>
      </main>

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
