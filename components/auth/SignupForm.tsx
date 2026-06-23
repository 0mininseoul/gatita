'use client'

import { useState, useEffect, useRef, useCallback, useMemo, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { NON_GACHON_ACCOUNT_MESSAGE, extractGachonProfileFromMetadata, getGoogleOAuthOptions, isGachonEmail } from '@/lib/auth'
import { formatAccountNumberForBank, isAccountNumberCompleteForBank } from '@/lib/banks'
import { AccountNumberSegmentField, BankSelectField } from '@/components/BankAccountFields'
import { generateRandomNickname } from '@/lib/nicknames'
import { identifyAnalyticsUser, trackEvent } from '@/lib/analytics/client'
import { AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'

type SignupFieldId = 'phone' | 'bank_name' | 'account_number' | 'account_holder' | 'nickname'
type SignupSectionId = 'basic' | 'payout' | 'review'

type SignupField = {
  id: SignupFieldId
  label: string
  errorLabel: string
  placeholder: string
  type: string
  required: boolean
  description?: string
}

type SignupSection = {
  id: SignupSectionId
  shortTitle: string
  title: string
  description: string
  fields: SignupFieldId[]
}

const SIGNUP_FIELDS: Record<SignupFieldId, SignupField> = {
  phone: {
    id: 'phone',
    label: '전화번호',
    errorLabel: '전화번호',
    placeholder: '010-0000-0000',
    type: 'tel',
    required: true,
    description: '동행 중 연락이 필요한 경우에만 사용됩니다. 가입 후 설정에서 변경할 수 없습니다.',
  },
  bank_name: {
    id: 'bank_name',
    label: '정산 받을 은행',
    errorLabel: '은행',
    placeholder: '은행 선택',
    type: 'button',
    required: true,
    description: '방을 개설하면 같은 방 참여자에게 공개될 수 있습니다.',
  },
  account_number: {
    id: 'account_number',
    label: '계좌번호',
    errorLabel: '계좌번호',
    placeholder: '1234-5678-9012',
    type: 'text',
    required: true,
    description: '선택한 은행 형식에 맞춰 숫자만 입력해주세요.',
  },
  account_holder: {
    id: 'account_holder',
    label: '예금주',
    errorLabel: '예금주 이름',
    placeholder: '홍길동',
    type: 'text',
    required: true,
    description: '계좌에 표시된 이름과 동일해야 합니다.',
  },
  nickname: {
    id: 'nickname',
    label: '닉네임',
    errorLabel: '닉네임',
    placeholder: '가천존예여신',
    type: 'text',
    required: true,
    description: '방 목록과 채팅에서 다른 사용자에게 보여질 이름입니다.',
  },
}

const SIGNUP_SECTIONS: SignupSection[] = [
  {
    id: 'basic',
    shortTitle: '기본 정보',
    title: '연락처와 닉네임을 입력해주세요',
    description: '학교 계정 정보를 불러왔어요. 전화번호는 가입 후 변경할 수 없어요.',
    fields: ['phone', 'nickname'],
  },
  {
    id: 'payout',
    shortTitle: '정산 계좌',
    title: '정산 계좌를 등록해주세요',
    description: '방을 개설했을 때 같이 탄 멤버가 송금할 계좌입니다.',
    fields: ['bank_name', 'account_number', 'account_holder'],
  },
  {
    id: 'review',
    shortTitle: '마지막 확인',
    title: '입력한 정보를 확인해주세요',
    description: '가입 후 전화번호는 변경할 수 없고, 정산 계좌와 닉네임은 설정에서 수정할 수 있습니다.',
    fields: [],
  },
]

interface SignupFormProps {
  onSuccess: () => void
  onBackToLanding?: () => void
  startWithProfileStep?: boolean
}

export default function SignupForm({ onSuccess, onBackToLanding, startWithProfileStep = false }: SignupFormProps) {
  const [currentStep, setCurrentStep] = useState(() => startWithProfileStep ? 0 : -1)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [hasAcceptedRequiredTerms, setHasAcceptedRequiredTerms] = useState(false)
  const [hasAcceptedUsageRules, setHasAcceptedUsageRules] = useState(false)
  const [payoutSkipped, setPayoutSkipped] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const currentSection = SIGNUP_SECTIONS[currentStep]
  const isLastStep = currentStep === SIGNUP_SECTIONS.length - 1
  const contentRef = useRef<HTMLDivElement | null>(null)
  const currentSectionRef = useRef<HTMLDivElement | null>(null)
  const hasCheckedSessionRef = useRef(false)
  const onSuccessRef = useRef(onSuccess)

  const focusCurrentSection = useCallback(() => {
    window.setTimeout(() => {
      currentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 120)
    window.setTimeout(() => {
      currentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 320)
  }, [])

  const scrollContentToTop = useCallback(() => {
    window.setTimeout(() => {
      contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }, 40)
  }, [])

  useEffect(() => {
    onSuccessRef.current = onSuccess
  }, [onSuccess])

  const checkSession = useCallback(async () => {
    if (hasCheckedSessionRef.current) return

    hasCheckedSessionRef.current = true

    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        const email = session.user.email
        if (isGachonEmail(email)) {
          const googleProfile = extractGachonProfileFromMetadata(session.user.user_metadata)

          const profileResponse = await fetch('/api/profile/me')
          const profileResult = await profileResponse.json().catch(() => null) as { profileCompleted?: boolean } | null

          if (!profileResponse.ok) {
            throw new Error(profileResult && 'error' in profileResult ? String(profileResult.error) : '프로필 확인 중 오류가 발생했습니다')
          }

          if (!profileResult?.profileCompleted) {
            setFormData(prev => ({
              ...prev,
              name: prev.name || googleProfile.name,
              department: prev.department || googleProfile.department || '학과 미확인',
            }))
            setCurrentStep(0)
          } else {
            onSuccessRef.current()
          }
        } else {
          toast.error(NON_GACHON_ACCOUNT_MESSAGE)
          await supabase.auth.signOut()
        }
      }
    } catch (error) {
      console.error('Signup session check error:', error)
    }
  }, [supabase])

  useEffect(() => {
    checkSession()
  }, [checkSession])

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    trackEvent('login_started', {
      method: 'google',
      source: 'profile_setup',
    })
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: getGoogleOAuthOptions(),
      })
      if (error) throw error
    } catch (error: any) {
      console.error('Google login error:', error)
      trackEvent('login_failed', {
        method: 'google',
        source: 'profile_setup',
      })
      toast.error('구글 로그인 중 오류가 발생했습니다')
      setIsLoading(false)
    }
  }

  const validateField = (fieldId: SignupFieldId, value: string): string | null => {
    const field = SIGNUP_FIELDS[fieldId]

    if (!value.trim() && field.required) {
      return `${field.errorLabel}을(를) 입력해주세요`
    }

    switch (fieldId) {
      case 'phone': {
        const phoneRegex = /^010-\d{4}-\d{4}$/
        if (!phoneRegex.test(value)) {
          return '010-0000-0000 형식으로 입력해주세요'
        }
        break
      }
      case 'bank_name':
        if (value.trim().length < 2) {
          return '은행을 선택하거나 입력해주세요'
        }
        break
      case 'account_number':
        if (!isAccountNumberCompleteForBank(formData.bank_name, value)) {
          return '선택한 은행의 계좌번호 형식에 맞게 입력해주세요'
        }
        break
      case 'account_holder':
        if (value.trim().length < 2) {
          return '예금주 이름을 2자 이상 입력해주세요'
        }
        break
      case 'nickname':
        if (value.length < 2 || value.length > 10) {
          return '닉네임은 2-10자로 입력해주세요'
        }
        break
    }
    return null
  }

  const validateCurrentSection = () => {
    const nextErrors: Record<string, string> = {}

    currentSection.fields.forEach((fieldId) => {
      const error = validateField(fieldId, formData[fieldId] || '')
      if (error) {
        nextErrors[fieldId] = error
      }
    })

    if (isLastStep && !hasAcceptedRequiredTerms) {
      nextErrors.consent = '개인정보처리방침과 서비스약관에 동의해주세요'
    }
    if (isLastStep && !hasAcceptedUsageRules) {
      nextErrors.usageRules = '서비스 이용 준수사항을 확인해주세요'
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleNext = async () => {
    if (!validateCurrentSection()) {
      focusCurrentSection()
      return
    }

    if (currentSection.fields.includes('nickname')) {
      setIsLoading(true)
      try {
        const { data } = await supabase
          .from('users')
          .select('nickname')
          .eq('nickname', formData.nickname)
          .maybeSingle()

        if (data) {
          setErrors({ nickname: '이미 사용 중인 닉네임입니다' })
          focusCurrentSection()
          setIsLoading(false)
          return
        }
      } catch (error) {
        // Error means no duplicate - continue
      }
      setIsLoading(false)
    }

    setErrors({})
    trackEvent('profile_setup_step_completed', {
      step_id: currentSection.id,
      step_index: currentStep,
    })

    if (isLastStep) {
      await handleSignup()
    } else {
      setCurrentStep(prev => prev + 1)
      scrollContentToTop()
    }
  }

  const handleSkipPayout = () => {
    setPayoutSkipped(true)
    setFormData(prev => ({ ...prev, bank_name: '', account_number: '', account_holder: '' }))
    setErrors({})
    trackEvent('profile_setup_payout_skipped', {
      step_index: currentStep,
    })
    setCurrentStep(prev => prev + 1)
    scrollContentToTop()
  }

  const handleSignup = async () => {
    setIsLoading(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()

      if (!sessionData.session?.user) {
        throw new Error('로그인 세션이 없습니다')
      }

      const userId = sessionData.session.user.id

      const response = await fetch('/api/profile/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          nickname: formData.nickname.trim(),
          bank_name: (formData.bank_name ?? '').trim(),
          account_number: (formData.account_number ?? '').trim(),
          account_holder: (formData.account_holder ?? '').trim(),
        }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error ?? '회원가입 중 오류가 발생했습니다')
      }

      toast.success('회원가입이 완료되었습니다!')
      identifyAnalyticsUser(userId, {
        profile_completed: true,
        account_status: 'active',
        is_admin: false,
        department: formData.department || '학과 미확인',
      })
      trackEvent('profile_completed', {
        department: formData.department || '학과 미확인',
      })
      onSuccess()
    } catch (error: any) {
      console.error('Signup error:', error)
      trackEvent('profile_completion_failed', {
        step_id: currentSection?.id,
      })
      toast.error(error.message || '회원가입 중 오류가 발생했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (fieldId: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value
    }))

    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[fieldId]
        return newErrors
      })
    }

    if (['bank_name', 'account_number', 'account_holder'].includes(fieldId) && value.trim()) {
      setPayoutSkipped(false)
    }
  }

  const handlePhoneChange = (value: string) => {
    handleInputChange('phone', formatPhoneNumber(value))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading) {
      handleNext()
    }
  }

  const handleBack = async () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
      setErrors({})
      scrollContentToTop()
      return
    }

    if (currentStep === 0) {
      if (onBackToLanding) {
        setErrors({})
        onBackToLanding()
        return
      }

      await supabase.auth.signOut()
      setFormData({})
      setErrors({})
      setCurrentStep(-1)
      return
    }

    onBackToLanding?.()
  }

  useEffect(() => {
    if (currentStep < 0) return

    const root = document.documentElement
    const previousSignupViewportHeight = root.style.getPropertyValue('--signup-viewport-height')
    const setSignupViewportHeight = () => {
      const visualHeight = window.visualViewport?.height ?? window.innerHeight
      root.style.setProperty('--signup-viewport-height', `${Math.ceil(visualHeight)}px`)
    }

    setSignupViewportHeight()
    window.addEventListener('resize', setSignupViewportHeight)
    window.addEventListener('orientationchange', setSignupViewportHeight)
    window.visualViewport?.addEventListener('resize', setSignupViewportHeight)
    window.visualViewport?.addEventListener('scroll', setSignupViewportHeight)

    return () => {
      if (previousSignupViewportHeight) {
        root.style.setProperty('--signup-viewport-height', previousSignupViewportHeight)
      } else {
        root.style.removeProperty('--signup-viewport-height')
      }
      window.removeEventListener('resize', setSignupViewportHeight)
      window.removeEventListener('orientationchange', setSignupViewportHeight)
      window.visualViewport?.removeEventListener('resize', setSignupViewportHeight)
      window.visualViewport?.removeEventListener('scroll', setSignupViewportHeight)
    }
  }, [currentStep])

  const canContinue = useMemo(() => {
    if (!currentSection || isLoading) return false
    if (isLastStep) return hasAcceptedRequiredTerms && hasAcceptedUsageRules

    return currentSection.fields.every((fieldId) => Boolean((formData[fieldId] || '').trim()))
  }, [currentSection, formData, hasAcceptedRequiredTerms, hasAcceptedUsageRules, isLastStep, isLoading])

  const formattedAccountNumber = useMemo(
    () => formatAccountNumberForBank(formData.bank_name, formData.account_number || ''),
    [formData.account_number, formData.bank_name]
  )

  const getSectionSummary = (sectionId: SignupSectionId) => {
    switch (sectionId) {
      case 'basic':
        return {
          title: '기본 정보',
          value: `${formData.name || '이름 미확인'} · ${formData.nickname || '닉네임 미입력'}`,
          detail: `${formData.department || '학과 미확인'} · ${formData.phone || '전화번호 미입력'}`,
        }
      case 'payout':
        return {
          title: '정산 계좌',
          value: formData.bank_name || '나중에 입력',
          detail: formData.bank_name
            ? (formattedAccountNumber ? `${formattedAccountNumber} · ${formData.account_holder || '예금주 미입력'}` : '계좌번호 미입력')
            : '설정에서 추가할 수 있어요',
        }
      case 'review':
        return {
          title: '마지막 확인',
          value: '가입 전 확인',
          detail: '약관 동의가 필요합니다.',
        }
    }
  }

  const renderField = (fieldId: SignupFieldId) => {
    const field = SIGNUP_FIELDS[fieldId]
    const value = formData[fieldId] || ''

    if (fieldId === 'bank_name') {
      return (
        <FormField key={fieldId} field={field} error={errors[fieldId]}>
          <BankSelectField
            value={value}
            onChange={(nextValue) => handleInputChange(fieldId, nextValue)}
            error={errors[fieldId]}
            presentation="sheet"
            showErrorMessage={false}
          />
        </FormField>
      )
    }

    if (fieldId === 'account_number') {
      return (
        <FormField key={fieldId} field={field}>
          <AccountNumberSegmentField
            bankName={formData.bank_name || ''}
            value={value}
            onChange={(nextValue) => handleInputChange(fieldId, nextValue)}
            error={errors[fieldId]}
          />
        </FormField>
      )
    }

    if (fieldId === 'phone') {
      return (
        <FormField key={fieldId} field={field} error={errors[fieldId]}>
          <InputField
            id={`signup-${fieldId}`}
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            enterKeyHint="next"
            value={value}
            onChange={handlePhoneChange}
            onKeyDown={handleKeyDown}
            placeholder={field.placeholder}
            error={errors[fieldId]}
          />
        </FormField>
      )
    }

    if (fieldId === 'nickname') {
      return (
        <FormField key={fieldId} field={field} error={errors[fieldId]}>
          <InputField
            id={`signup-${fieldId}`}
            type={field.type}
            value={value}
            onChange={(nextValue) => handleInputChange(fieldId, nextValue)}
            onKeyDown={handleKeyDown}
            placeholder={field.placeholder}
            error={errors[fieldId]}
            autoComplete="off"
            enterKeyHint="done"
            maxLength={10}
          />
          <button
            type="button"
            onClick={() => handleInputChange('nickname', generateRandomNickname(formData.nickname))}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-bold text-primary-700 transition hover:bg-primary-100"
          >
            🎲 랜덤 추천
          </button>
        </FormField>
      )
    }

    return (
      <FormField key={fieldId} field={field} error={errors[fieldId]}>
        <InputField
          id={`signup-${fieldId}`}
          type={field.type}
          value={value}
          onChange={(nextValue) => handleInputChange(fieldId, nextValue)}
          onKeyDown={handleKeyDown}
          placeholder={field.placeholder}
          error={errors[fieldId]}
          autoComplete="off"
          enterKeyHint="next"
        />
      </FormField>
    )
  }

  if (currentStep === -1) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex items-center p-4 border-b border-gray-100">
          <button
            onClick={handleBack}
            className="p-2 mr-2 hover:bg-gray-100 rounded-lg"
            aria-label="뒤로"
          >
            <ChevronDown className="w-6 h-6 rotate-90" />
          </button>
          <h1 className="text-lg font-semibold">회원가입</h1>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-md space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                &lt;같이타&gt;에 오신 걸<br/>환영합니다.
              </h2>
              <p className="text-gray-600">
                가천대학교 구글 계정으로 시작하세요
              </p>
            </div>

            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full bg-white border-2 border-gray-300 hover:border-gray-400 rounded-xl px-6 py-4 flex items-center justify-center space-x-3 transition-all"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="text-lg font-medium text-gray-700">
                {isLoading ? '로그인 중...' : 'Google로 계속하기'}
              </span>
            </button>

            <p className="text-sm text-gray-500 text-center">
              * 가천대학교 이메일(@gachon.ac.kr)만 사용 가능합니다
            </p>

            <p className="text-xs leading-5 text-gray-500 text-center">
              프로필 세팅 마지막 단계에서 같이타의{' '}
              <Link href="/terms" className="font-medium text-primary-600 underline">
                서비스약관
              </Link>
              과{' '}
              <Link href="/privacy" className="font-medium text-primary-600 underline">
                개인정보처리방침
              </Link>
              에 명시적으로 동의해야 합니다.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col overflow-hidden bg-gray-50"
      style={{ height: 'var(--signup-viewport-height, 100dvh)' }}
    >
      <header className="shrink-0 border-b border-gray-100 bg-white px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            className="grid h-10 w-10 place-items-center rounded-full text-gray-900 transition hover:bg-gray-100"
            aria-label="뒤로"
          >
            <ChevronDown className="h-6 w-6 rotate-90" />
          </button>
          <div className="text-center">
            <p className="text-xs font-semibold text-primary-600">{currentStep + 1} / {SIGNUP_SECTIONS.length}</p>
            <h1 className="text-sm font-bold text-gray-950">{currentSection.shortTitle}</h1>
          </div>
          <div className="h-10 w-10" />
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-primary-600 transition-all duration-300"
            style={{ width: `${((currentStep + 1) / SIGNUP_SECTIONS.length) * 100}%` }}
          />
        </div>
      </header>

      <main
        ref={contentRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5"
        style={{
          paddingBottom: '1.5rem',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {currentStep > 0 && (
          <div className="mb-5 space-y-2">
            {SIGNUP_SECTIONS.slice(0, currentStep).map((section, index) => {
              const summary = getSectionSummary(section.id)
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => {
                    setCurrentStep(index)
                    setErrors({})
                    scrollContentToTop()
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm shadow-gray-950/[0.03]"
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-gray-500">{summary.title}</span>
                    <span className="block truncate text-sm font-bold text-gray-950">{summary.value}</span>
                    <span className="block truncate text-xs font-medium text-gray-500">{summary.detail}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-primary-600">수정</span>
                </button>
              )
            })}
          </div>
        )}

        <section
          ref={currentSectionRef}
          onFocusCapture={focusCurrentSection}
          className="rounded-2xl bg-white px-5 py-5 shadow-sm shadow-gray-950/[0.04]"
        >
          <p className="mb-2 text-sm font-semibold text-primary-600">{currentSection.shortTitle}</p>
          <h2 className="text-[26px] font-extrabold leading-tight tracking-normal text-gray-950">
            {currentSection.title}
          </h2>
          <p className="mt-2 text-sm font-medium leading-5 text-gray-500">
            {currentSection.description}
          </p>

          {currentSection.id === 'basic' && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50">
              <ReadOnlyProfileRow
                label="이름"
                value={formData.name || '이름 미확인'}
                detail={formData.department ? `${formData.department} · Google 계정 정보` : 'Google 계정 정보'}
              />
            </div>
          )}

          <div className="mt-6 space-y-5">
            {currentSection.fields.map(renderField)}
          </div>

          {currentSection.id === 'payout' && (
            <button
              type="button"
              onClick={handleSkipPayout}
              className="mt-4 w-full text-center text-sm font-semibold text-gray-500 underline underline-offset-2"
            >
              나중에 입력할게요
            </button>
          )}

          {currentSection.id === 'review' && (
            <ReviewPanel
              formData={formData}
              formattedAccountNumber={formattedAccountNumber}
              hasAcceptedRequiredTerms={hasAcceptedRequiredTerms}
              setHasAcceptedRequiredTerms={setHasAcceptedRequiredTerms}
              hasAcceptedUsageRules={hasAcceptedUsageRules}
              setHasAcceptedUsageRules={setHasAcceptedUsageRules}
              clearConsentError={() => {
                if (errors.consent) {
                  setErrors(prev => {
                    const next = { ...prev }
                    delete next.consent
                    return next
                  })
                }
              }}
              clearUsageRulesError={() => {
                if (errors.usageRules) {
                  setErrors(prev => {
                    const next = { ...prev }
                    delete next.usageRules
                    return next
                  })
                }
              }}
              consentError={errors.consent}
              usageRulesError={errors.usageRules}
            />
          )}
        </section>
      </main>

      <footer className="shrink-0 border-t border-gray-100 bg-white/95 px-5 py-3 backdrop-blur" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <button
          onClick={handleNext}
          disabled={!canContinue}
          className="btn-primary w-full"
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <span className="loading-spinner mr-2" />
              처리중...
            </span>
          ) : isLastStep ? (
            '가입 완료'
          ) : (
            '다음'
          )}
        </button>
      </footer>
    </div>
  )
}

function ReadOnlyProfileRow({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-3">
      <span className="shrink-0 text-xs font-semibold text-gray-500">{label}</span>
      <span className="min-w-0 text-right">
        <span className="block truncate text-sm font-extrabold text-gray-950">{value}</span>
        {detail && (
          <span className="mt-0.5 block truncate text-[11px] font-semibold text-gray-500">{detail}</span>
        )}
      </span>
    </div>
  )
}

function FormField({
  field,
  error,
  children,
}: {
  field: SignupField
  error?: string
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-2">
        <label htmlFor={`signup-${field.id}`} className="text-sm font-semibold text-gray-900">
          {field.label}
        </label>
        {field.description && (
          <p className="mt-1 text-xs font-medium leading-4 text-gray-500">
            {field.description}
          </p>
        )}
      </div>
      {children}
      {error && (
        <div className="mt-2 flex items-center text-sm font-semibold text-red-500">
          <AlertCircle className="mr-1 h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  )
}

function ReviewPanel({
  formData,
  formattedAccountNumber,
  hasAcceptedRequiredTerms,
  setHasAcceptedRequiredTerms,
  hasAcceptedUsageRules,
  setHasAcceptedUsageRules,
  clearConsentError,
  clearUsageRulesError,
  consentError,
  usageRulesError,
}: {
  formData: Record<string, string>
  formattedAccountNumber: string
  hasAcceptedRequiredTerms: boolean
  setHasAcceptedRequiredTerms: (value: boolean) => void
  hasAcceptedUsageRules: boolean
  setHasAcceptedUsageRules: (value: boolean) => void
  clearConsentError: () => void
  clearUsageRulesError: () => void
  consentError?: string
  usageRulesError?: string
}) {
  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-xl border border-gray-200 bg-gray-50">
        <ReviewRow label="실명" value={formData.name} />
        <ReviewRow label="학과" value={formData.department || '학과 미확인'} />
        <ReviewRow label="전화번호" value={formData.phone} />
        <ReviewRow label="닉네임" value={formData.nickname} />
        <ReviewRow
          label="정산 계좌"
          value={formData.bank_name ? `${formData.bank_name} ${formattedAccountNumber} ${formData.account_holder}` : '나중에 입력 (설정에서 추가 가능)'}
        />
      </div>

      <div className="rounded-xl border border-primary-100 bg-primary-50 px-3 py-3">
        <p className="text-[11px] font-semibold leading-5 text-primary-800">
          정산 계좌는 방을 개설한 경우 같은 방 참여자에게만 표시됩니다.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
        <label className="flex items-start gap-2 text-xs font-semibold leading-5 text-gray-700">
          <input
            type="checkbox"
            checked={hasAcceptedRequiredTerms}
            onChange={(event) => {
              setHasAcceptedRequiredTerms(event.target.checked)
              clearConsentError()
            }}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span>
            <Link href="/terms" className="font-semibold text-primary-700 underline">
              서비스약관
            </Link>
            과{' '}
            <Link href="/privacy" className="font-semibold text-primary-700 underline">
              개인정보처리방침
            </Link>
            에 동의합니다.
          </span>
        </label>
        <p className="mt-2 text-[10px] font-semibold leading-4 text-gray-500">
          &lt;같이타&gt;는 현재 수집된 개인정보를 마케팅에 일체 활용하지 않습니다.
        </p>
        {consentError && (
          <div className="mt-2 flex items-center text-xs font-semibold text-red-500">
            <AlertCircle className="mr-1 h-3.5 w-3.5" />
            {consentError}
          </div>
        )}
        <label className="mt-3 flex items-start gap-2 border-t border-gray-100 pt-3 text-xs font-semibold leading-5 text-gray-700">
          <input
            type="checkbox"
            checked={hasAcceptedUsageRules}
            onChange={(event) => {
              setHasAcceptedUsageRules(event.target.checked)
              clearUsageRulesError()
            }}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="line-clamp-2 leading-5">
            &lt;같이타&gt;를 자가용 차량으로 돈을 받고 동승자를 태워주는 데 사용하지 않겠습니다.
          </span>
        </label>
        {usageRulesError && (
          <div className="mt-2 flex items-center text-xs font-semibold text-red-500">
            <AlertCircle className="mr-1 h-3.5 w-3.5" />
            {usageRulesError}
          </div>
        )}
      </div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-3 py-3 last:border-b-0">
      <span className="shrink-0 text-xs font-medium text-gray-500">{label}</span>
      <span className="min-w-0 text-right text-xs font-semibold text-gray-950">{value || '-'}</span>
    </div>
  )
}

interface InputFieldProps {
  id: string
  type: string
  value: string
  onChange: (value: string) => void
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
  placeholder: string
  error?: string
  autoComplete?: string
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search'
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send'
  maxLength?: number
}

function InputField({
  id,
  type,
  value,
  onChange,
  onKeyDown,
  placeholder,
  error,
  autoComplete,
  inputMode,
  enterKeyHint,
  maxLength,
}: InputFieldProps) {
  return (
    <input
      id={id}
      type={type}
      inputMode={inputMode}
      enterKeyHint={enterKeyHint}
      autoComplete={autoComplete}
      value={value}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={`input-field h-14 text-base font-semibold ${error ? 'border-red-500' : ''}`}
    />
  )
}

function formatPhoneNumber(value: string) {
  const rawDigits = value.replace(/\D/g, '')
  const digits = rawDigits.startsWith('8210')
    ? `0${rawDigits.slice(2, 12)}`
    : rawDigits.slice(0, 11)

  if (digits.length <= 3) {
    return digits
  }

  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}
