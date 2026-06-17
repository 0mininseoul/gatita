'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User, LocationType, LOCATIONS, Favorite } from '@/lib/supabase'
import { MapPin, ArrowRight, Star, Settings, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'

import SignupForm from '@/components/auth/SignupForm'
import LoginForm from '@/components/auth/LoginForm'
import Hyperspeed from '@/components/Hyperspeed'
import { hyperspeedPresets } from '@/components/presets'
import SplitText from '@/components/SplitText'
import NavigationBar from '@/components/NavigationBar'

type AuthMode = 'login' | 'signup' | null

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState<AuthMode>(null)
  const [fromLocation, setFromLocation] = useState<LocationType | ''>('')
  const [toLocation, setToLocation] = useState<LocationType | ''>('')
  const [favorites, setFavorites] = useState<Favorite[]>([])
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

  const checkAuth = useCallback(async () => {
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
    const urlMode = params.get('mode')

    if (urlMode === 'login' || urlMode === 'signup') {
      setAuthMode(urlMode as AuthMode)
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

  if (!user) {
    if (authMode === 'login') {
      return (
        <LoginForm
          onBackToLanding={() => setAuthMode(null)}
          onStartSignup={() => setAuthMode('signup')}
        />
      )
    }
    if (authMode === 'signup') { return <SignupForm onSuccess={() => setAuthMode(null)} onBackToLanding={() => setAuthMode(null)} /> }

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

          <NavigationBar onFindClick={handleFindClick} />

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
              marginBottom: '2.5rem', color: 'rgba(255, 255, 255, 0.8)'
            }}>
              가천대 학생들을 위한 통학길 동행 플랫폼
            </p>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setAuthMode('login')} style={{ padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: '600', color: '#000', backgroundColor: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'transform 0.2s' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
                로그인
              </button>
              <button onClick={() => setAuthMode('signup')} style={{ padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: '600', color: '#fff', backgroundColor: 'transparent', border: '1px solid #fff', borderRadius: '8px', cursor: 'pointer', transition: 'background-color 0.2s, transform 0.2s' }} onMouseOver={e => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; e.currentTarget.style.transform = 'scale(1.05)'; }} onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}>
                회원가입
              </button>
            </div>
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
