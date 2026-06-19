'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { getGoogleOAuthOptions } from '@/lib/auth'
import { trackEvent } from '@/lib/analytics/client'
import { ChevronLeft } from 'lucide-react'
import toast from 'react-hot-toast'

interface LoginFormProps {
  onBackToLanding: () => void
  onStartSignup: () => void
}

export default function LoginForm({ onBackToLanding, onStartSignup }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    trackEvent('login_started', {
      method: 'google',
      source: 'login_form',
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
        source: 'login_form',
      })
      toast.error('구글 로그인 중 오류가 발생했습니다')
      setIsLoading(false)
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
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              다시 만나서<br/>반가워요!
            </h2>
            <p className="text-gray-600">
              가천대학교 구글 계정으로 로그인하세요
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
              {isLoading ? '로그인 중...' : 'Google로 로그인'}
            </span>
          </button>

          <p className="text-sm text-gray-500 text-center">
            * 가천대학교 이메일(@gachon.ac.kr)만 사용 가능합니다
          </p>

          <p className="text-xs leading-5 text-gray-500 text-center">
            로그인하면 같이타의{' '}
            <Link href="/terms" className="font-medium text-primary-600 underline">
              서비스약관
            </Link>
            과{' '}
            <Link href="/privacy" className="font-medium text-primary-600 underline">
              개인정보처리방침
            </Link>
            을 확인한 것으로 간주됩니다.
          </p>

          <div className="text-center pt-4 border-t border-gray-100">
            <p className="text-sm text-gray-600 mb-2">
              아직 계정이 없으신가요?
            </p>
            <button
              onClick={onStartSignup}
              className="text-primary-600 font-medium text-sm hover:text-primary-700"
            >
              회원가입하기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
