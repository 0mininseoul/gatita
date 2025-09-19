'use client'

import { useState, useEffect } from 'react'
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
    id: 'email',
    label: '가천대 이메일을 입력해주세요',
    placeholder: 'example@gachon.ac.kr',
    type: 'email',
    required: true,
    description: '가천대학교 이메일만 사용 가능합니다'
  },
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
    type: 'tel',
    required: true,
    description: '동행자에게 공개되지 않습니다'
  },
  {
    id: 'nickname',
    label: '닉네임을 입력해주세요',
    placeholder: '같이타는길동',
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
  },
  {
    id: 'password',
    label: '비밀번호를 입력해주세요',
    placeholder: '8자 이상 입력',
    type: 'password',
    required: true,
    description: '8자 이상 입력해주세요'
  }
]

interface SignupFormProps {
  onSuccess: () => void
}

export default function SignupForm({ onSuccess }: SignupFormProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const supabase = createClient()

  const currentStepData = SIGNUP_STEPS[currentStep]
  const isLastStep = currentStep === SIGNUP_STEPS.length - 1

  const validateStep = (step: SignupStep, value: string): string | null => {
    if (!value && step.required) {
      return `${step.label}을(를) 입력해주세요`
    }

    switch (step.id) {
      case 'email':
        if (!value.endsWith('@gachon.ac.kr')) {
          return '가천대학교 이메일만 사용할 수 있습니다'
        }
        break
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
      case 'password':
        if (value.length < 8) {
          return '비밀번호는 8자 이상 입력해주세요'
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

    // 이메일 중복 확인 (Auth 테이블과 users 테이블 둘 다 확인)
    if (currentStepData.id === 'email') {
      setIsLoading(true)
      try {
        // Auth users 확인
        const { data: authData } = await supabase.auth.admin.listUsers()
        const emailExists = authData.users.some(user => user.email === value)
        
        if (emailExists) {
          setErrors({ email: '이미 가입된 이메일입니다' })
          setIsLoading(false)
          return
        }

        // public.users 테이블도 확인
        const { data: userData } = await supabase
          .from('users')
          .select('email')
          .eq('email', value)
          .single()

        if (userData) {
          setErrors({ email: '이미 가입된 이메일입니다' })
          setIsLoading(false)
          return
        }
      } catch (error) {
        // 에러가 발생하면 사용자가 없는 것으로 간주
      }
      setIsLoading(false)
    }

    // 닉네임 중복 확인
    if (currentStepData.id === 'nickname') {
      setIsLoading(true)
      try {
        const { data, error } = await supabase
          .from('users')
          .select('nickname')
          .eq('nickname', value)
          .single()

        if (data) {
          setErrors({ nickname: '이미 사용 중인 닉네임입니다' })
          setIsLoading(false)
          return
        }
      } catch (error) {
        // 닉네임이 없으면 에러가 발생하므로 정상적인 상황
      }
      setIsLoading(false)
    }

    setErrors({})
    
    if (isLastStep) {
      await handleSignup()
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleSignup = async () => {
    setIsLoading(true)
    
    try {
      // 1. Supabase Auth 회원가입
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            name: formData.name,
            phone: formData.phone,
            nickname: formData.nickname,
            department: formData.department,
          }
        }
      })

      if (authError) throw authError

      if (authData.user) {
        // 2. public.users 테이블에 사용자 프로필 생성
        const { error: profileError } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            email: formData.email,
            name: formData.name,
            phone: formData.phone,
            nickname: formData.nickname,
            department: formData.department,
            status: 'active',
            is_admin: false
          })

        if (profileError) {
          console.error('Profile creation error:', profileError)
          // Auth 계정은 생성되었지만 프로필 생성 실패 시에도 성공으로 처리
          // (로그인 시 프로필을 다시 생성하는 로직이 있음)
        }

        toast.success('회원가입이 완료되었습니다!')
        onSuccess()
      }
    } catch (error: any) {
      console.error('Signup error:', error)
      toast.error(error.message || '회원가입 중 오류가 발생했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      [currentStepData.id]: value
    }))
    
    // 실시간 에러 제거
    if (errors[currentStepData.id]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[currentStepData.id]
        return newErrors
      })
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleNext()
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <button
          onClick={() => currentStep > 0 ? setCurrentStep(prev => prev - 1) : null}
          className={`p-2 ${currentStep === 0 ? 'invisible' : 'visible'}`}
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

      {/* Content */}
      <div className="flex-1 flex flex-col p-6">
        <div className="flex-1">
          {/* Question */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {currentStepData.label}
            </h1>
            {currentStepData.description && (
              <p className="text-gray-600 text-sm">
                {currentStepData.description}
              </p>
            )}
          </div>

          {/* Input */}
          <div className="mb-6">
            {currentStepData.type === 'select' ? (
              <SelectField
                options={currentStepData.options || []}
                value={formData[currentStepData.id] || ''}
                onChange={handleInputChange}
                placeholder={currentStepData.placeholder}
                error={errors[currentStepData.id]}
              />
            ) : (
              <InputField
                type={currentStepData.type}
                value={formData[currentStepData.id] || ''}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder={currentStepData.placeholder}
                error={errors[currentStepData.id]}
                autoFocus
              />
            )}
          </div>
        </div>

        {/* Next Button */}
        <button
          onClick={handleNext}
          disabled={!formData[currentStepData.id] || isLoading}
          className="btn-primary w-full"
        >
          {isLoading ? (
            <div className="flex items-center justify-center">
              <div className="loading-spinner mr-2" />
              처리중...
            </div>
          ) : isLastStep ? (
            '가입완료'
          ) : (
            '다음'
          )}
        </button>
      </div>
    </div>
  )
}

// Input Field Component
interface InputFieldProps {
  type: string
  value: string
  onChange: (value: string) => void
  onKeyPress: (e: React.KeyboardEvent) => void
  placeholder: string
  error?: string
  autoFocus?: boolean
}

function InputField({ 
  type, 
  value, 
  onChange, 
  onKeyPress, 
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
        onKeyPress={onKeyPress}
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
