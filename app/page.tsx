'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User, LocationType, LOCATIONS, Favorite } from '@/lib/supabase'
import { MapPin, ArrowRight, Star, Settings, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'

import SignupForm from '@/components/auth/SignupForm'
import Hyperspeed from '@/components/Hyperspeed'
import { hyperspeedPresets } from '@/components/presets'
import SplitText from '@/components/SplitText'
import NavigationBar from '@/components/NavigationBar'

type AuthMode = 'signup' | null

const getOAuthRedirectUrl = () => `${window.location.origin}/`

function GoogleIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState<AuthMode>(null)
  const [fromLocation, setFromLocation] = useState<LocationType | ''>('')
  const [toLocation, setToLocation] = useState<LocationType | ''>('')
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [isStartingGoogle, setIsStartingGoogle] = useState(false)
  const [hasEnteredApp, setHasEnteredApp] = useState(false)
  const router = useRouter()
  const hyperspeedOptions = useMemo(() => ({ ...hyperspeedPresets.one }), [])

  const supabase = useMemo(() => {
    try {
      return createClient()
    } catch (error) {
      console.error('Supabase client creation error:', error)
      return null
    }
  }, [])

  const loadFavorites = useCallback(async (userId: string) => {
    if (!supabase) {
      return
    }

    try {
      const { data } = await supabase
        .from('favorites')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (data) setFavorites(data)
    } catch (error) {
      console.error('Load favorites error:', error)
    }
  }, [supabase])

  const checkAuth = useCallback(async (enterApp = false) => {
    if (!supabase) {
      setLoading(false)
      return
    }

    try {
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('getSession timeout')), 15000)
      })
      const { data: { session }, error: sessionError } = await Promise.race([
        supabase.auth.getSession(),
        timeout
      ])

      if (sessionError) {
        throw sessionError
      }

      if (session?.user) {
        const email = session.user.email
        if (!email?.endsWith('@gachon.ac.kr')) {
          toast.error('가천대학교 이메일만 사용 가능합니다')
          await supabase.auth.signOut()
          return
        }

        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()

        if (userData) {
          setUser(userData)
          await loadFavorites(userData.id)
          if (enterApp) setHasEnteredApp(true)
        } else {
          setAuthMode('signup')
        }
      }
    } catch (error) {
      console.error('Auth check error:', error)
    } finally {
      setLoading(false)
    }
  }, [loadFavorites, supabase])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    const params = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const authError = params.get('error_description') || hashParams.get('error_description')

    if (authError) {
      toast.error(decodeURIComponent(authError).replace(/\+/g, ' '))
      window.history.replaceState({}, '', window.location.pathname)
    }

    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const email = session.user.email
        if (email && !email.endsWith('@gachon.ac.kr')) {
          toast.error('가천대학교 이메일만 사용 가능합니다')
          await supabase.auth.signOut()
          return
        }

        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()

        if (userData) {
          setUser(userData)
          await loadFavorites(userData.id)
          setAuthMode(null)
        } else {
          setAuthMode('signup')
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setFavorites([])
      }
    })

    return () => subscription.unsubscribe()
  }, [checkAuth, loadFavorites, supabase])

  const handleSearch = () => {
    if (!fromLocation || !toLocation) {
      toast.error('출발지와 도착지를 모두 선택해주세요')
      return
    }

    if (fromLocation === toLocation) {
      toast.error('출발지와 도착지가 같을 수 없습니다')
      return
    }

    router.push(`/rooms?from=${fromLocation}&to=${toLocation}`)
  }

  const handleFavoriteClick = (favorite: Favorite) => {
    router.push(`/rooms?from=${favorite.from_location}&to=${favorite.to_location}`)
  }

  const handleLogout = async () => {
    if (!supabase) return

    try {
      await supabase.auth.signOut()
      setUser(null)
      setFavorites([])
      toast.success('로그아웃되었습니다')
    } catch (error) {
      toast.error('로그아웃 중 오류가 발생했습니다')
    }
  }

  const handleGoogleStart = async () => {
    if (!supabase) {
      toast.error('인증 설정을 불러오지 못했습니다')
      return
    }

    setIsStartingGoogle(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getOAuthRedirectUrl(),
        },
      })
      if (error) throw error
    } catch (error) {
      console.error('Google login error:', error)
      toast.error('구글 로그인 중 오류가 발생했습니다')
      setIsStartingGoogle(false)
    }
  }

  const handleEnterApp = () => {
    setHasEnteredApp(true)
  }

  const handleFindClick = () => {
    toast.error('먼저 로그인하셔야 합니다.');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
        <p className="text-white text-lg">로딩 중...</p>
        <p className="text-gray-400 text-sm mt-2">잠시만 기다려주세요</p>
      </div>
    )
  }

  if (authMode === 'signup') {
    return (
      <SignupForm
        onSuccess={() => {
          setAuthMode(null)
          checkAuth(true)
        }}
        onBackToLanding={() => setAuthMode(null)}
      />
    )
  }

  if (!user || !hasEnteredApp) {
    return (
      <main style={{
        position: 'relative', width: '100vw', height: '100vh',
        backgroundColor: '#000', color: 'white',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
          <Hyperspeed effectOptions={hyperspeedOptions} />
        </div>

        <div style={{
          position: 'relative', zIndex: 10, width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: '2rem', paddingLeft: '1rem', paddingRight: '1rem',
        }}>

          <NavigationBar onFindClick={user ? handleEnterApp : handleFindClick} />

          <div style={{
            marginTop: '20vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}>
            <SplitText
              text="같이 탈래요?"
              tag="h1"
              className="font-bold"
              from={{ opacity: 0, y: 50, scale: 0.9 }}
              to={{ opacity: 1, y: 0, scale: 1 }}
              duration={0.8}
              delay={80}
              style={{ fontSize: '3rem', marginBottom: '1rem' }}
            />

            <p style={{
              fontFamily: 'var(--font-paperlogy), sans-serif',
              fontWeight: 500,
              fontSize: '1.125rem', maxWidth: '600px',
              marginBottom: '1rem', color: 'rgba(255, 255, 255, 0.8)'
            }}>
              가천대 학생들을 위한 통학길 동행 플랫폼
            </p>

            <p style={{
              fontFamily: 'var(--font-paperlogy), sans-serif',
              fontWeight: 400,
              fontSize: '0.95rem',
              lineHeight: 1.6,
              maxWidth: '320px',
              marginBottom: '2rem',
              color: 'rgba(255, 255, 255, 0.68)'
            }}>
              같은 경로의 학생과 출발 시간을 맞추고 채팅방에서 바로 동행을 정해요.
            </p>

            <div style={{ display: 'flex', width: '100%', maxWidth: '320px' }}>
              <button
                onClick={user ? handleEnterApp : handleGoogleStart}
                disabled={!user && isStartingGoogle}
                style={{
                  width: '100%',
                  minHeight: '3.25rem',
                  padding: '0.875rem 1rem',
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: '#111827',
                  backgroundColor: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: (!user && isStartingGoogle) ? 'not-allowed' : 'pointer',
                  transition: 'transform 0.2s, opacity 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.625rem',
                  opacity: (!user && isStartingGoogle) ? 0.7 : 1,
                }}
                onMouseOver={e => {
                  if (!(!user && isStartingGoogle)) e.currentTarget.style.transform = 'scale(1.03)'
                }}
                onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                {!user && <GoogleIcon />}
                {user ? '바로 시작하기' : (isStartingGoogle ? 'Google로 이동 중...' : 'Google로 3초 안에 시작하기')}
              </button>
            </div>
          </div>

          <div style={{
            position: 'absolute',
            bottom: '1.5rem',
            display: 'flex',
            gap: '1rem',
            fontSize: '0.75rem',
            color: 'rgba(255, 255, 255, 0.68)'
          }}>
            <Link href="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>
              개인정보처리방침
            </Link>
            <Link href="/terms" style={{ color: 'inherit', textDecoration: 'underline' }}>
              서비스약관
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">같이타</h1>
            <p className="text-sm text-gray-600">{user.nickname}님, 안녕하세요!</p>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={() => router.push('/settings')} className="p-2 hover:bg-gray-100 rounded-lg">
              <Settings className="w-5 h-5 text-gray-600" />
            </button>
            {user.is_admin && (
              <button onClick={() => router.push('/admin')} className="p-2 hover:bg-gray-100 rounded-lg bg-red-50" title="관리자 페이지">
                <Star className="w-5 h-5 text-red-600" />
              </button>
            )}
            <button onClick={handleLogout} className="p-2 hover:bg-gray-100 rounded-lg">
              <LogOut className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">어느 경로로 통학하세요?</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">출발지</label>
              <select value={fromLocation} onChange={(e) => setFromLocation(e.target.value as LocationType)} className="input-field">
                <option value="">출발지 선택</option>
                {Object.entries(LOCATIONS).map(([key, value]) => ( <option key={key} value={key}>{value}</option> ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">도착지</label>
              <select value={toLocation} onChange={(e) => setToLocation(e.target.value as LocationType)} className="input-field">
                <option value="">도착지 선택</option>
                {Object.entries(LOCATIONS).map(([key, value]) => ( <option key={key} value={key}>{value}</option> ))}
              </select>
            </div>
            <button onClick={handleSearch} disabled={!fromLocation || !toLocation} className="btn-primary w-full flex items-center justify-center">
              동행자 찾기
              <ArrowRight className="w-5 h-5 ml-2" />
            </button>
          </div>
        </div>

        {favorites.length > 0 && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">즐겨찾기 경로</h3>
              <Star className="w-5 h-5 text-yellow-500" />
            </div>
            <div className="space-y-3">
              {favorites.map((favorite) => (
                <button key={favorite.id} onClick={() => handleFavoriteClick(favorite)} className="w-full p-4 bg-gray-50 hover:bg-gray-100 rounded-lg flex items-center justify-between transition-colors">
                  <div className="flex items-center">
                    <MapPin className="w-4 h-4 text-gray-500 mr-2" />
                    <span className="text-sm font-medium">
                      {LOCATIONS[favorite.from_location]} → {LOCATIONS[favorite.to_location]}
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
