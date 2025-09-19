'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User, LocationType, LOCATIONS, Favorite } from '@/lib/supabase'
import { MapPin, ArrowRight, Star, Settings, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'

import SignupForm from '@/components/auth/SignupForm'
import LoginForm from '@/components/auth/LoginForm'
import Hyperspeed from '@/components/Hyperspeed'
import { hyperspeedPresets } from '@/components/presets'
import SplitText from '@/components/SplitText' // SplitText 컴포넌트 임포트

type AuthMode = 'login' | 'signup' | null

export default function HomePage() {
  // ... (useState, useEffect 등 기존 로직은 그대로 유지) ...
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState<AuthMode>(null)
  const [fromLocation, setFromLocation] = useState<LocationType | ''>('')
  const [toLocation, setToLocation] = useState<LocationType | ''>('')
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await checkAuth()
        setAuthMode(null);
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setFavorites([])
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const checkAuth = async () => { /* ... 기존과 동일 ... */ 
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data: userData } = await supabase.from('users').select('*').eq('id', session.user.id).single()
        if (userData) {
          setUser(userData)
          loadFavorites(userData.id)
        } else {
          await supabase.auth.signOut()
        }
      }
    } catch (error) { console.error('Auth check error:', error) } 
    finally { setLoading(false) }
  }
  const loadFavorites = async (userId: string) => { /* ... 기존과 동일 ... */ 
    try {
      const { data } = await supabase.from('favorites').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      if (data) setFavorites(data)
    } catch (error) { console.error('Load favorites error:', error) }
  }
  const handleSearch = () => { /* ... 기존과 동일 ... */ 
    if (!fromLocation || !toLocation) { toast.error('출발지와 도착지를 모두 선택해주세요'); return }
    if (fromLocation === toLocation) { toast.error('출발지와 도착지가 같을 수 없습니다'); return }
    router.push(`/rooms?from=${fromLocation}&to=${toLocation}`)
  }
  const handleFavoriteClick = (favorite: Favorite) => { /* ... 기존과 동일 ... */
    router.push(`/rooms?from=${favorite.from_location}&to=${favorite.to_location}`)
  }
  const handleLogout = async () => { /* ... 기존과 동일 ... */
    try {
      await supabase.auth.signOut()
      setUser(null)
      setFavorites([])
      toast.success('로그아웃되었습니다')
    } catch (error) { toast.error('로그아웃 중 오류가 발생했습니다') }
  }

  if (loading) { /* ... 기존과 동일 ... */ 
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <p className="text-white">Loading...</p> 
      </div>
    )
  }

  if (!user) {
    if (authMode === 'login') { return <LoginForm onSuccess={() => setAuthMode(null)} onBackToLanding={() => setAuthMode(null)} /> }
    if (authMode === 'signup') { return <SignupForm onSuccess={() => setAuthMode(null)} /> }

    // ✨ 수정된 랜딩 화면 ✨
    return (
      <main style={{
        position: 'relative', width: '100vw', height: '100vh',
        backgroundColor: '#000', color: 'white',
        overflow: 'hidden', // 모바일 스크롤 문제 해결
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
          <Hyperspeed effectOptions={{ ...hyperspeedPresets.one }} />
        </div>
        <div style={{
          position: 'relative', zIndex: 10, width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: '1rem'
        }}>

          {/* "같이타" -> SplitText 컴포넌트로 교체 */}
          <SplitText
            text="같이 탈래요?"
            tag="h1"
            className="font-bold"
            from={{ opacity: 0, y: 50, scale: 0.9 }}
            to={{ opacity: 1, y: 0, scale: 1 }}
            duration={0.8}
            delay={80}
            style={{ 
              fontSize: 'clamp(2.5rem, 5vw, 4rem)', 
              marginBottom: '1rem' 
            }}
          />

          {/* Pretendard 폰트 및 두께 적용 */}
          <p style={{
            fontFamily: "'Pretendard', sans-serif",
            fontWeight: 500,
            fontSize: 'clamp(1rem, 2.5vw, 1.25rem)', maxWidth: '600px',
            marginBottom: '2.5rem', color: 'rgba(255, 255, 255, 0.8)'
          }}>
            가천대 학생들을 위한 통학길 동행 플랫폼
          </p>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={() => setAuthMode('login')} style={{ /* ... 기존 버튼 스타일 ... */ padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: '600', color: '#000', backgroundColor: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'transform 0.2s' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
              로그인
            </button>
            <button onClick={() => setAuthMode('signup')} style={{ /* ... 기존 버튼 스타일 ... */ padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: '600', color: '#fff', backgroundColor: 'transparent', border: '1px solid #fff', borderRadius: '8px', cursor: 'pointer', transition: 'background-color 0.2s, transform 0.2s' }} onMouseOver={e => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; e.currentTarget.style.transform = 'scale(1.05)'; }} onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}>
              회원가입
            </button>
          </div>
        </div>
      </main>
    )
  }

  // 로그인된 사용자의 메인 화면 (수정 없음)
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ... 기존 로그인 후 화면 코드 ... */}
      <header className="bg-white border-b border-gray-100 px-4 py-4"><div className="flex items-center justify-between"><div><h1 className="text-xl font-bold text-gray-900">같이타</h1><p className="text-sm text-gray-600">{user.nickname}님, 안녕하세요!</p></div><div className="flex items-center space-x-2"><button onClick={() => router.push('/settings')} className="p-2 hover:bg-gray-100 rounded-lg"><Settings className="w-5 h-5 text-gray-600" /></button>{user.is_admin && (<button onClick={() => router.push('/admin')} className="p-2 hover:bg-gray-100 rounded-lg bg-red-50" title="관리자 페이지"><Star className="w-5 h-5 text-red-600" /></button>)}<button onClick={handleLogout} className="p-2 hover:bg-gray-100 rounded-lg"><LogOut className="w-5 h-5 text-gray-600" /></button></div></div></header><div className="container mx-auto px-4 py-6 space-y-6"><div className="card p-6"><h2 className="text-lg font-semibold mb-4">어느 경로로 통학하세요?</h2><div className="space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-2">출발지</label><select value={fromLocation} onChange={(e) => setFromLocation(e.target.value as LocationType)} className="input-field"><option value="">출발지 선택</option>{Object.entries(LOCATIONS).map(([key, value]) => ( <option key={key} value={key}>{value}</option> ))}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-2">도착지</label><select value={toLocation} onChange={(e) => setToLocation(e.target.value as LocationType)} className="input-field"><option value="">도착지 선택</option>{Object.entries(LOCATIONS).map(([key, value]) => ( <option key={key} value={key}>{value}</option> ))}</select></div><button onClick={handleSearch} disabled={!fromLocation || !toLocation} className="btn-primary w-full flex items-center justify-center">동행자 찾기<ArrowRight className="w-5 h-5 ml-2" /></button></div></div>{favorites.length > 0 && (<div className="card p-6"><div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">즐겨찾기 경로</h3><Star className="w-5 h-5 text-yellow-500" /></div><div className="space-y-3">{favorites.map((favorite) => (<button key={favorite.id} onClick={() => handleFavoriteClick(favorite)} className="w-full p-4 bg-gray-50 hover:bg-gray-100 rounded-lg flex items-center justify-between transition-colors"><div className="flex items-center"><MapPin className="w-4 h-4 text-gray-500 mr-2" /><span className="text-sm font-medium">{LOCATIONS[favorite.from_location]} → {LOCATIONS[favorite.to_location]}</span></div><ArrowRight className="w-4 h-4 text-gray-400" /></button>))}</div></div>)}</div>
    </div>
  )
}
