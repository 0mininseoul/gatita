'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { ChevronLeft, Eye, EyeOff, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface LoginFormProps {
  onSuccess: () => void
  onBackToLanding?: () => void
}

export default function LoginForm({ onSuccess, onBackToLanding }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 유효성 검사
    const newErrors: Record<string, string> = {}
    
    if (!email) {
      newErrors.email = '이메일을 입력해주세요'
    } else if (!email.endsWith('@gachon.ac.kr')) {
      newErrors.email = '가천대학교 이메일만 사용할 수 있습니다'
    }
    
    if (!password) {
      newErrors.password = '비밀번호를 입력해주세요'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setIsLoading(true)
    setErrors({})

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      })

      if (error) {
        console.error('Login error:', error)
        if (error.message.includes('Invalid login credentials')) {
          setErrors({ 
            password: '이메일 또는 비밀번호가 올바르지 않습니다' 
          })
        } else {
          toast.error('로그인 중 오류가 발생했습니다')
        }
        return
      }

      if (data.user) {
        // 사용자 프로필 확인
        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.user.id)
          .single()

        if (!userData) {
          toast.error('사용자 정보를 찾을 수 없습니다')
          await supabase.auth.signOut()
          return
        }

        toast.success('로그인되었습니다!')
        onSuccess()
      }
    } catch (error: any) {
      console.error('Login error:', error)
      toast.error('로그인 중 오류가 발생했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    if (field === 'email') {
      setEmail(value)
    } else {
      setPassword(value)
    }
    
    // 실시간 에러 제거
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center p-4 border-b border-gray-100">
        <button
          onClick={onBackToLanding}
          className="p-2 mr-2 hover:bg-gray-100 rounded-lg"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-semibold">로그인</h1>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-6">
        <div className="flex-1">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              다시 만나서 반가워요!
            </h2>
            <p className="text-gray-600">
              가천대 이메일로 로그인해주세요
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {/* 이메일 입력 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                이메일
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="example@gachon.ac.kr"
                className={`input-field ${errors.email ? 'border-red-500' : ''}`}
                autoComplete="email"
              />
              {errors.email && (
                <div className="flex items-center mt-2 text-red-500 text-sm">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {errors.email}
                </div>
              )}
            </div>

            {/* 비밀번호 입력 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                비밀번호
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  className={`input-field pr-12 ${errors.password ? 'border-red-500' : ''}`}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5 text-gray-400" />
                  ) : (
                    <Eye className="w-5 h-5 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.password && (
                <div className="flex items-center mt-2 text-red-500 text-sm">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {errors.password}
                </div>
              )}
            </div>

            {/* 로그인 버튼 */}
            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="btn-primary w-full"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="loading-spinner mr-2" />
                  로그인 중...
                </div>
              ) : (
                '로그인'
              )}
            </button>
          </form>
        </div>

        {/* 하단 링크 */}
        <div className="text-center space-y-4">
          <p className="text-sm text-gray-600">
            아직 계정이 없으신가요?
          </p>
          <button
            onClick={onBackToLanding}
            className="text-primary-600 font-medium text-sm"
          >
            회원가입하기
          </button>
        </div>
      </div>
    </div>
  )
}
