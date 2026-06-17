'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { DEPARTMENTS } from '@/lib/supabase'
import { ChevronDown, Check, AlertCircle } from 'lucide-react'
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
    description: '동행자에게 공개되지 않습니다'
  },
  {
    id: 'nickname',
    label: '닉네임을 입력해주세요',
    placeholder: '테토영민',
    type: 'text',
    required: true,
    description: '다른 사용자에게 보여질 이름입니다'
  },
  {
    id: 'department',
    label: '학과를 선택해주세요',
    placeholder: '학과 선택',
    type: 'select',
    required: true,
    options: DEPARTMENTS,
    description: '가입 후 변경할 수 없습니다'
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
  const isLastStep = currentStep === SIGNUP_STEPS.length - 1

  const checkSession = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        const email = session.user.email
        if (email?.endsWith('@gachon.ac.kr')) {
          setGoogleEmail(email)

          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle()

          if (!profile) {
            setCurrentStep(0)
          } else {
            onSuccess()
          }
        } else {
          toast.error('가천대학교 이메일만 사용 가능합니다')
          await supabase.auth.signOut()
        }
      }
    } catch (error) {
      console.error('Signup session check error:', error)
    }
  }, [onSuccess, supabase])

  useEffect(() => {
    checkSession()
  }, [checkSession])

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}?mode=signup`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      })
      if (error) throw error
    } catch (error: any) {
      console.error('Google login error:', error)
      toast.error('구글 로그인 중 오류가 발생했습니다')
      setIsLoading(false)
    }
  }

  const validateStep = (step: SignupStep, value: string): string | null => {
    if (!value && step.required) {
      return `${step.label}을(를) 입력해주세요`
    }

    switch (step.id) {
      case 'phone':
        const phoneRegex = /^010-\d{4}-\d{4}$/
        if (!phoneRegex.test(value)) {
          return '010-0000-0000 형식으로 입력해주세요'
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
          name: formData.name,
          phone: formData.phone,
          nickname: formData.nickname,
          department: formData.department,
          status: 'active',
          is_admin: false
        })

      if (profileError) {
        console.error('Profile creation error:', profileError)
        throw profileError
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
                {step.type === 'select' ? (
                  <SelectField
                    options={step.options || []}
                    value={formData[step.id] || ''}
                    onChange={(v) => handleInputChange(step.id, v)}
                    placeholder={step.placeholder}
                    error={errors[step.id]}
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

// Select Field Component
interface SelectFieldProps {
  options: string[]
  value: string
  onChange: (value: string) => void
  placeholder: string
  error?: string
}

function SelectField({ options, value, onChange, placeholder, error }: SelectFieldProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`input-field text-left flex items-center justify-between ${
          error ? 'border-red-500' : ''
        }`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value || placeholder}
        </span>
        <ChevronDown className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
          {options.map((option) => (
            <button
              key={option}
              onClick={() => {
                onChange(option)
                setIsOpen(false)
              }}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between"
            >
              {option}
              {value === option && <Check className="w-4 h-4 text-primary-600" />}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center mt-2 text-red-500 text-sm">
          <AlertCircle className="w-4 h-4 mr-1" />
          {error}
        </div>
      )}
    </div>
  )
}
