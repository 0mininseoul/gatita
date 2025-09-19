'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Eye, EyeOff, AlertCircle, Check } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isValidSession, setIsValidSession] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const supabase = createClient()

  useEffect(() => {
    // URL에서 토큰 확인
    const accessToken = searchParams.get('access_token')
    const refreshToken = searchParams.get('refresh_token')
    
    if (accessToken && refreshToken) {
      // 토큰으로 세션 설정
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      }).then(({ error }) => {
        if (error) {
          console.error('Session error:', error)
          toast.error('잘못된 링크입니다')
          router.push('/')
        } else {
          setIsValidSession(true)
        }
      })
    } else {
      toast.error('잘못된 링크입니다')
      router.push('/')
    }
  }, [searchParams, router])

  const validatePasswords = () => {
    const newErrors: Record<string, string> = {}

    if (!password) {
      newErrors.password = '새 비밀번호를 입력해주세요'
    } else if (password.length < 8) {
      newErrors.password = '비밀번호는 8자 이상이어야 합니다'
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = '비밀번호 확인을 입력해주세요'
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = '비밀번호가 일치하지 않습니다'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validatePasswords()) return

    setIsLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      })

      if (error) throw error

      toast.success('비밀번호가 성공적으로 변경되었습니다!')
      
      // 2초 후 홈으로 이동
      setTimeout(() => {
        router.push('/')
      }, 2000)

    } catch (error: any) {
      console.error('Password update error:', error)
      toast.error('비밀번호 변경 중 오류가 발생했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    if (field === 'password') {
      setPassword(value)
    } else {
      setConfirmPassword(value)
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

  if (!isValidSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="loading-spinner" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            새 비밀번호 설정
          </h1>
          <p className="text-gray-600">
            새로운 비밀번호를 입력해주세요
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <form onSubmit={handleResetPassword} className="space-y-6">
            {/* 새 비밀번호 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                새 비밀번호
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder="8자 이상 입력해주세요"
                  className={`input-field pr-12 ${errors.password ? 'border-red-500' : ''}`}
                  autoComplete="new-password"
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

            {/* 비밀번호 확인 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                비밀번호 확인
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  placeholder="비밀번호를 다시 입력해주세요"
                  className={`input-field pr-12 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-5 h-5 text-gray-400" />
                  ) : (
                    <Eye className="w-5 h-5 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <div className="flex items-center mt-2 text-red-500 text-sm">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {errors.confirmPassword}
                </div>
              )}
            </div>

            {/* 비밀번호 강도 표시 */}
            {password && (
              <div className="space-y-2">
                <div className="text-xs text-gray-600">비밀번호 강도:</div>
                <div className="flex space-x-1">
                  <div className={`h-2 flex-1 rounded ${password.length >= 8 ? 'bg-green-400' : 'bg-gray-200'}`} />
                  <div className={`h-2 flex-1 rounded ${password.length >= 10 && /[A-Z]/.test(password) ? 'bg-green-400' : 'bg-gray-200'}`} />
                  <div className={`h-2 flex-1 rounded ${password.length >= 12 && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password) ? 'bg-green-400' : 'bg-gray-200'}`} />
                </div>
                <div className="text-xs text-gray-500">
                  {password.length < 8 ? '8자 이상 입력하세요' :
                   password.length < 10 ? '보통' :
                   /[A-Z]/.test(password) && /[0-9]/.test(password) ? '강함' : '보통'}
                </div>
              </div>
            )}

            {/* 제출 버튼 */}
            <button
              type="submit"
              disabled={isLoading || !password || !confirmPassword}
              className="btn-primary w-full"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="loading-spinner mr-2" />
                  변경 중...
                </div>
              ) : (
                '비밀번호 변경'
              )}
            </button>
          </form>

          {/* 안내 문구 */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              비밀번호 변경 후 새로운 비밀번호로 로그인해주세요
            </p>
            <button
              onClick={() => router.push('/')}
              className="mt-2 text-sm text-primary-600 hover:text-primary-700"
            >
              홈으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
