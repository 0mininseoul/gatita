'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User, LocationType, LOCATIONS, Favorite } from '@/lib/supabase'
import { MapPin, ArrowRight, Star, Settings, LogOut, Plus } from 'lucide-react'
import SignupForm from '@/components/auth/SignupForm'
import LoginForm from '@/components/auth/LoginForm'
import toast from 'react-hot-toast'

type AuthMode = 'login' | 'signup' | null

export default function HomePage() {
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
  }, [])

  const checkAuth = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      
      if (authUser) {
        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single()
        
        if (userData) {
          setUser(userData)
          loadFavorites(userData.id)
        }
      }
    } catch (error) {
      console.error('Auth check error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadFavorites = async (userId: string) => {
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
  }

  const handleSearch = () => {
    if (!fromLocation || !toLocation) {
      toast.error('출발지와 도착지를 모두 선택해주세요')
      return
    }
    
    if (fromLocation === toLocation) {
      toast.error('출발지와 도착지가 같을 수 없습니다')
      return
    }

    // URL에 경로 정보를 포함하여 검색 결과 페이지로 이동
    router.push(`/rooms?from=${fromLocation}&to=${toLocation}`)
  }

  const handleFavoriteClick = (favorite: Favorite) => {
    router.push(`/rooms?from=${favorite.from_location}&to=${favorite.to_location}`)
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      setUser(null)
      setFavorites([])
      toast.success('로그아웃되었습니다')
    } catch (error) {
      toast.error('로그아웃 중 오류가 발생했습니다')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-spinner" />
      </div>
    )
  }

  // 인증이 필요한 경우
  if (!user) {
    if (authMode === 'signup') {
      return <SignupForm onSuccess={() => { setAuthMode(null); checkAuth(); }} />
    }
    
    if (authMode === 'login') {
      return <LoginForm onSuccess={() => { setAuthMode(null); checkAuth(); }} />
    }

    // 초기 랜딩 화면
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white">
        <div className="container mx-auto px-4 py-16">
          {/* 로고 및 제목 */}
          <div className="text-center mb-12">
            <div className="w-20 h-20 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <MapPin className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">같이타</h1>
            <p className="text-gray-600 text-lg">
              가천대 학생들을 위한<br />
              통학 경로 동행 커뮤니티
            </p>
          </div>

          {/* 기능 소개 */}
          <div className="space-y-6 mb-12">
            <div className="card p-6">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mr-4">
                  <MapPin className="w-6 h-6 text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold">같은 경로 동행자 찾기</h3>
              </div>
              <p className="text-gray-600">
                가천대역, 정문, 교육대학원, AI공학관 간<br />
                같은 경로로 이동하는 동행자를 찾아보세요
              </p>
            </div>

            <div className="card p-6">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                  <Star className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold">안전한 커뮤니티</h3>
              </div>
              <p className="text-gray-600">
                가천대 이메일 인증을 통한<br />
                안전하고 신뢰할 수 있는 서비스
              </p>
            </div>
          </div>

          {/* 버튼 */}
          <div className="space-y-3">
            <button
              onClick={() => setAuthMode('signup')}
              className="btn-primary w-full"
            >
              회원가입하고 시작하기
            </button>
            <button
              onClick={() => setAuthMode('login')}
              className="btn-secondary w-full"
            >
              이미 계정이 있나요? 로그인
            </button>
          </div>

          {/* 관리자 문의 */}
          <div className="mt-12 text-center">
            <div className="card p-6">
              <p className="text-sm text-gray-600 mb-2">문의사항이 있으신가요?</p>
              <p className="text-sm font-medium text-primary-600">
                인스타그램 @0_min._.00 으로 DM 주세요
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 로그인된 사용자의 메인 화면
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">같이타</h1>
            <p className="text-sm text-gray-600">{user.nickname}님, 안녕하세요!</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => router.push('/settings')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <Settings className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <LogOut className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* 경로 선택 */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">어느 경로로 통학하세요?</h2>
          
          <div className="space-y-4">
            {/* 출발지 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                출발지
              </label>
              <select
                value={fromLocation}
                onChange={(e) => setFromLocation(e.target.value as LocationType)}
                className="input-field"
              >
                <option value="">출발지 선택</option>
                {Object.entries(LOCATIONS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            {/* 도착지 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                도착지
              </label>
              <select
                value={toLocation}
                onChange={(e) => setToLocation(e.target.value as LocationType)}
                className="input-field"
              >
                <option value="">도착지 선택</option>
                {Object.entries(LOCATIONS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            {/* 검색 버튼 */}
            <button
              onClick={handleSearch}
              disabled={!fromLocation || !toLocation}
              className="btn-primary w-full flex items-center justify-center"
            >
              동행자 찾기
              <ArrowRight className="w-5 h-5 ml-2" />
            </button>
          </div>
        </div>

        {/* 즐겨찾기 경로 */}
        {favorites.length > 0 && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">즐겨찾기 경로</h3>
              <Star className="w-5 h-5 text-yellow-500" />
            </div>
            
            <div className="space-y-3">
              {favorites.map((favorite) => (
                <button
                  key={favorite.id}
                  onClick={() => handleFavoriteClick(favorite)}
                  className="w-full p-4 bg-gray-50 hover:bg-gray-100 rounded-lg flex items-center justify-between transition-colors"
                >
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

        {/* 관리자 문의 */}
        <div className="card p-6 text-center">
          <p className="text-sm text-gray-600 mb-2">문의사항이 있으신가요?</p>
          <p className="text-sm font-medium text-primary-600">
            인스타그램 @0_min._.00 으로 DM 주세요
          </p>
        </div>
      </div>
    </div>
  )
}
