'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { NON_GACHON_ACCOUNT_MESSAGE, extractGachonProfileFromMetadata, getGoogleOAuthOptions, isGachonEmail } from '@/lib/auth'
import { getBankOption, isAccountNumberCompleteForBank } from '@/lib/banks'
import { AccountNumberSegmentField, BankSelectField } from '@/components/BankAccountFields'
import { ChevronDown, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

type SignupStep = {
  id: string
  label: string
  placeholder: string
  type: string
  required: boolean
  options?: string[]
  description?: string
}

const SIGNUP_STEPS: SignupStep[] = [
  {
    id: 'name',
    label: '실명을 입력해주세요',
    placeholder: '홍길동',
    type: 'text',
    required: true,
    description: '실명을 정확히 입력해주세요'
  },
  {
    id: 'phone',
    label: '전화번호를 입력해주세요',
    placeholder: '010-1234-5678',
    type: 'text',
    required: true,
    description: '가입 후 설정에서 변경할 수 없습니다'
  },
  {
    id: 'bank_name',
    label: '정산 받을 은행을 입력해주세요',
    placeholder: '토스뱅크',
    type: 'text',
    required: true,
    description: '방장이 되면 같은 방 참여자에게 공개됩니다'
  },
  {
    id: 'account_number',
    label: '계좌번호를 입력해주세요',
    placeholder: '1234-5678-9012',
    type: 'text',
    required: true,
    description: '방장이 되면 같은 방 참여자에게 공개됩니다'
  },
  {
    id: 'account_holder',
    label: '계좌주 이름을 입력해주세요',
    placeholder: '홍길동',
    type: 'text',
    required: true,
    description: '방장이 되면 같은 방 참여자에게 공개됩니다'
  },
  {
    id: 'nickname',
    label: '닉네임을 입력해주세요',
    placeholder: '테토영민',
    type: 'text',
    required: true,
    description: '다른 사용자에게 보여질 이름입니다'
  }
]

interface SignupFormProps {
  onSuccess: () => void
  onBackToLanding?: () => void
}

export default function SignupForm({ onSuccess, onBackToLanding }: SignupFormProps) {
  const [currentStep, setCurrentStep] = useState(-1) // -1 = Google login screen, 0+ = profile steps
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const supabase = useMemo(() => createClient(), [])
  const [activatedSteps, setActivatedSteps] = useState<boolean[]>(Array(SIGNUP_STEPS.length).fill(false))
  const [googleEmail, setGoogleEmail] = useState<string>('')

  const currentStepData = SIGNUP_STEPS[currentStep]
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const hasCheckedSessionRef = useRef(false)
  const onSuccessRef = useRef(onSuccess)
  const isLastStep = currentStep === SIGNUP_STEPS.length - 1

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
          setGoogleEmail(email)
          const googleProfile = extractGachonProfileFromMetadata(session.user.user_metadata)

          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle()

          if (!profile) {
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
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: getGoogleOAuthOptions(),
      })
      if (error) throw error
    } catch (error: any) {
      console.error('Google login error:', error)
      toast.error('구글 로그인 중 오류가 발생했습니다')
      setIsLoading(false)
    }
  }

  const validateStep = (step: SignupStep, value: string): string | null => {
    if (!value.trim() && step.required) {
      return `${step.label}을(를) 입력해주세요`
    }

    switch (step.id) {
      case 'phone':
        const phoneRegex = /^010-\d{4}-\d{4}$/
        if (!phoneRegex.test(value)) {
          return '010-0000-0000 형식으로 입력해주세요'
        }
        break
      case 'bank_name':
        if (!getBankOption(value)) {
          return '은행을 선택해주세요'
        }
        break
      case 'account_number':
        if (!isAccountNumberCompleteForBank(formData.bank_name, value)) {
          return '선택한 은행의 계좌번호 형식에 맞게 입력해주세요'
        }
        break
      case 'account_holder':
        if (value.trim().length < 2) {
          return '계좌주 이름을 2자 이상 입력해주세요'
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

  const handleNext = async () => {
    const value = formData[currentStepData.id] || ''
    const error = validateStep(currentStepData, value)

    if (error) {
      setErrors({ [currentStepData.id]: error })
      return
    }

    // 닉네임 중복 확인
    if (currentStepData.id === 'nickname') {
      setIsLoading(true)
      try {
        const { data } = await supabase
          .from('users')
          .select('nickname')
          .eq('nickname', value)
          .maybeSingle()

        if (data) {
          setErrors({ nickname: '이미 사용 중인 닉네임입니다' })
          setIsLoading(false)
          return
        }
      } catch (error) {
        // Error means no duplicate - continue
      }
      setIsLoading(false)
    }

    setErrors({})

    if (isLastStep) {
      await handleSignup()
    } else {
      setCurrentStep(prev => prev + 1)
      // 다음 질문으로 부드럽게 스크롤
      setTimeout(() => {
        const nextStep = SIGNUP_STEPS[currentStep + 1]
        const el = stepRefs.current[nextStep.id]
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 50)
    }
  }

  const handleSignup = async () => {
    setIsLoading(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()

      if (!sessionData.session?.user) {
        throw new Error('로그인 세션이 없습니다')
      }

      const userId = sessionData.session.user.id
      const userEmail = sessionData.session.user.email || googleEmail

      // 사용자 프로필 생성
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: userId,
          email: userEmail,
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          nickname: formData.nickname.trim(),
          department: formData.department || '학과 미확인',
          status: 'active',
          is_admin: false
        })

      if (profileError) {
        console.error('Profile creation error:', profileError)
        throw profileError
      }

      const { error: payoutError } = await supabase
        .from('user_payout_accounts')
        .insert({
          user_id: userId,
          bank_name: formData.bank_name.trim(),
          account_number: formData.account_number.trim(),
          account_holder: formData.account_holder.trim(),
        })

      if (payoutError) {
        console.error('Payout account creation error:', payoutError)
        throw payoutError
      }

      toast.success('회원가입이 완료되었습니다!')
      onSuccess()
    } catch (error: any) {
      console.error('Signup error:', error)
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

    // 실시간 에러 제거
    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[fieldId]
        return newErrors
      })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleNext()
    }
  }

  const handleBack = async () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
      return
    }

    if (currentStep === 0) {
      if (onBackToLanding) {
        setErrors({})
        onBackToLanding()
        return
      }

      await supabase.auth.signOut()
      setGoogleEmail('')
      setFormData({})
      setErrors({})
      setCurrentStep(-1)
      return
    }

    onBackToLanding?.()
  }

  // Activate animation for the current step when it becomes visible
  useEffect(() => {
    if (currentStep < 0) return

    setActivatedSteps(prev => {
      const next = [...prev]
      next[currentStep] = true
      return next
    })
  }, [currentStep])

  // Google Login Screen (currentStep === -1)
  if (currentStep === -1) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        {/* Header */}
        <div className="flex items-center p-4 border-b border-gray-100">
          <button
            onClick={handleBack}
            className="p-2 mr-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronDown className="w-6 h-6 rotate-90" />
          </button>
          <h1 className="text-lg font-semibold">회원가입</h1>
        </div>

        {/* Content */}
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
              계속하면 같이타의{' '}
              <Link href="/terms" className="font-medium text-primary-600 underline">
                서비스약관
              </Link>
              과{' '}
              <Link href="/privacy" className="font-medium text-primary-600 underline">
                개인정보처리방침
              </Link>
              을 확인한 것으로 간주됩니다.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Profile completion steps (currentStep >= 0)
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <button
          onClick={handleBack}
          className="p-2"
        >
          <ChevronDown className="w-6 h-6 rotate-90" />
        </button>
        <div className="flex space-x-1">
          {SIGNUP_STEPS.map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full ${
                index <= currentStep ? 'bg-primary-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
        <div className="w-10" />
      </div>

      {/* Content: Stacked progressive steps */}
      <div className="flex-1 flex flex-col p-6 space-y-8">
        {SIGNUP_STEPS.slice(0, currentStep + 1).map((step, index) => {
          const isCurrent = index === currentStep
          return (
            <div
              key={step.id}
              ref={(el) => { stepRefs.current[step.id] = el }}
              className={`step-container ${activatedSteps[index] ? 'step-active' : 'step-enter'}`}
            >
              {/* Question */}
              <div className="mb-4">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  {step.label}
                </h1>
                {step.description && (
                  <p className="text-gray-600 text-sm">
                    {step.description}
                  </p>
                )}
              </div>


              {/* Input */}
              <div className="mb-2">
                {step.id === 'bank_name' ? (
                  <BankSelectField
                    value={formData[step.id] || ''}
                    onChange={(v) => handleInputChange(step.id, v)}
                    error={errors[step.id]}
                  />
                ) : step.id === 'account_number' ? (
                  <AccountNumberSegmentField
                    bankName={formData.bank_name || ''}
                    value={formData[step.id] || ''}
                    onChange={(v) => handleInputChange(step.id, v)}
                    error={errors[step.id]}
                  />
                ) : step.id === 'phone' ? (
                  <PhoneSegmentField
                    value={formData[step.id] || ''}
                    onChange={(v) => handleInputChange(step.id, v)}
                    error={errors[step.id]}
                    autoFocus={isCurrent}
                  />
                ) : (
                  <InputField
                    type={step.type}
                    value={formData[step.id] || ''}
                    onChange={(v) => handleInputChange(step.id, v)}
                    onKeyDown={isCurrent ? handleKeyDown : () => {}}
                    placeholder={step.placeholder}
                    error={errors[step.id]}
                    autoFocus={isCurrent}
                  />
                )}
              </div>

              {step.id === 'name' && formData.department && (
                <div className="mb-4 rounded-xl border border-primary-100 bg-primary-50 px-3 py-2 text-sm font-bold text-primary-700">
                  학과는 Google 계정 정보에서 {formData.department}(으)로 자동 등록됩니다.
                </div>
              )}

              {step.id === 'account_number' && (
                <p className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
                  방장으로 참여하면 계좌번호가 같은 방 멤버에게 노출될 수 있습니다.
                </p>
              )}

              {/* Next button only at the current step */}
              {isCurrent && (
                <button
                  onClick={handleNext}
                  disabled={!formData[step.id] || isLoading}
                  className="btn-primary w-full"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="loading-spinner mr-2" />
                      처리중...
                    </div>
                  ) : index === SIGNUP_STEPS.length - 1 ? (
                    '가입완료'
                  ) : (
                    '다음'
                  )}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function splitPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)

  return [
    digits.slice(0, 3),
    digits.slice(3, 7),
    digits.slice(7, 11),
  ]
}

function joinPhoneSegments(segments: string[]) {
  return segments.map((segment) => segment.replace(/\D/g, '')).filter(Boolean).join('-')
}

function PhoneSegmentField({
  value,
  onChange,
  error,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  error?: string
  autoFocus?: boolean
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const segmentLengths = [3, 4, 4]
  const segmentValues = useMemo(() => splitPhoneNumber(value), [value])

  const updateSegment = (index: number, nextValue: string) => {
    const digits = nextValue.replace(/\D/g, '')
    const nextSegments = [...segmentValues]
    const maxLength = segmentLengths[index]

    if (digits.length > maxLength) {
      const pastedSegments = splitPhoneNumber(digits)
      onChange(joinPhoneSegments(pastedSegments))
      inputRefs.current[pastedSegments.every(Boolean) ? 2 : pastedSegments.findIndex((segment) => !segment)]?.focus()
      return
    }

    nextSegments[index] = digits.slice(0, maxLength)
    onChange(joinPhoneSegments(nextSegments))

    if (digits.length >= maxLength) {
      inputRefs.current[index + 1]?.focus()
    }

  }

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Backspace') return
    if (segmentValues[index]) return

    inputRefs.current[index - 1]?.focus()
  }

  return (
    <div>
      <div className="grid grid-cols-[0.82fr_auto_1fr_auto_1fr] items-center gap-1.5">
        {segmentLengths.map((length, index) => (
          <div key={index} className="contents">
            <input
              ref={(element) => { inputRefs.current[index] = element }}
              type="tel"
              inputMode="numeric"
              value={segmentValues[index] ?? ''}
              onChange={(event) => updateSegment(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              maxLength={length}
              placeholder={index === 0 ? '010' : '0000'}
              autoFocus={autoFocus && index === 0}
              aria-label={`전화번호 ${index + 1}번째 입력칸`}
              className={`h-12 min-w-0 rounded-xl border bg-white px-3 text-center text-lg font-black tracking-normal text-gray-950 outline-none transition focus:border-primary-600 focus:ring-2 focus:ring-primary-100 ${
                error ? 'border-red-500' : 'border-gray-200'
              }`}
            />
            {index < segmentLengths.length - 1 && (
              <span className="text-center text-sm font-black text-gray-400">-</span>
            )}
          </div>
        ))}
      </div>
      {error && (
        <div className="mt-2 flex items-center text-sm text-red-500">
          <AlertCircle className="mr-1 h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  )
}

// Input Field Component
interface InputFieldProps {
  type: string
  value: string
  onChange: (value: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  placeholder: string
  error?: string
  autoFocus?: boolean
}

function InputField({
  type,
  value,
  onChange,
  onKeyDown,
  placeholder,
  error,
  autoFocus
}: InputFieldProps) {
  return (
    <div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`input-field ${error ? 'border-red-500' : ''}`}
      />
      {error && (
        <div className="flex items-center mt-2 text-red-500 text-sm">
          <AlertCircle className="w-4 h-4 mr-1" />
          {error}
        </div>
      )}
    </div>
  )
}
