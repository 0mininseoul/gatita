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
import SplitText from '@/components/SplitText'
import NavigationBar from '@/components/NavigationBar' // 1. 내비게이션 바 임포트

type AuthMode = 'login' | 'signup' | null

export default function HomePage() {
  // ... (기존 state 및 함수들은 그대로 유지) ...
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState<AuthMode>(null)
  const [fromLocation, setFromLocation] = useState<LocationType | ''>('')
  const [toLocation, setToLocation] = useState<LocationType | ''>('')
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { /* ... 기존과 동일 ... */ }, [])
  const checkAuth = async () => { /* ... 기존과 동일 ... */ }
  const loadFavorites = async (userId: string) => { /* ... 기존과 동일 ... */ }
  const handleSearch = () => { /* ... 기존과 동일 ... */ }
  const handleFavoriteClick = (favorite: Favorite) => { /* ... 기존과 동일 ... */ }
  const handleLogout = async () => { /* ... 기존과 동일 ... */ }

  // 2. "찾기" 버튼 클릭 시 실행될 함수 추가
  const handleFindClick = () => {
    toast.error('먼저 로그인하셔야 합니다.');
  };

  if (loading) { /* ... 기존과 동일 ... */ }

  if (!user) {
    if (authMode === 'login') { return <LoginForm onSuccess={() => setAuthMode(null)} onBackToLanding={() => setAuthMode(null)} /> }
    if (authMode === 'signup') { return <SignupForm onSuccess={() => setAuthMode(null)} /> }

    // ✨ 수정된 랜딩 화면 ✨
    return (
      <main style={{
        position: 'relative', width: '100vw', height: '100vh',
        backgroundColor: '#000', color: 'white',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
          <Hyperspeed effectOptions={{ ...hyperspeedPresets.one }} />
        </div>

        {/* 3. 내비게이션 바와 중앙 콘텐츠를 감싸는 새로운 레이아웃 div */}
        <div style={{
          position: 'relative', zIndex: 10, width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: '2rem', paddingLeft: '1rem', paddingRight: '1rem',
        }}>

          {/* 내비게이션 바 추가 및 클릭 함수 연결 */}
          <NavigationBar onFindClick={handleFindClick} />

          {/* 중앙 콘텐츠를 감싸는 div 추가 (화면 중앙 정렬) */}
          <div style={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
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
              style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', marginBottom: '1rem' }}
            />

            <p style={{
              fontFamily: "'Pretendard', sans-serif",
              fontWeight: 500,
              fontSize: 'clamp(1rem, 2.5vw, 1.25rem)', maxWidth: '600px',
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

  // 로그인된 사용자의 메인 화면 (수정 없음)
  return (
      // ... 기존 로그인 후 화면 코드는 그대로 ...
  )
}
