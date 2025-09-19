'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User } from '@/lib/supabase'
import { ArrowLeft, User as UserIcon, AlertCircle, Check } from 'lucide-react'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [newNickname, setNewNickname] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [nicknameError, setNicknameError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    checkAuthAndLoadData()
  }, [])

  const checkAuthAndLoadData = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      
      if (!authUser) {
        router.push('/')
        return
      }

      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single()
      
      if (userData) {
        setUser(userData)
        setNewNickname(userData.nickname)
      }
    } catch (error) {
      console.error('Auth/data loading error:', error)
      router.push('/')
    } finally {
      setLoading(false)
    }
  }

  const canChangeNickname = (lastUpdated?: string) => {
    if (!lastUpdated) return true // 한 번도 변경한 적 없으면 가능
    
    const twoWeeksAgo = new Date()
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
    
    return new Date(lastUpdated) <= twoWeeksAgo
  }

  const getNextChangeDate = (lastUpdated?: string) => {
    if (!lastUpdated) return null
    
    const nextChangeDate = new Date(lastUpdated)
    nextChangeDate.setDate(nextChangeDate.getDate() + 14)
    
    return nextChangeDate
  }

  const handleNicknameChange = async () => {
    if (!user || !newNickname.trim()) return

    // 유효성 검사
    if (newNickname.length < 2 || newNickname.length > 10) {
      setNicknameError('닉네임은 2-10자로 입력해주세요')
      return
    }

    if (newNickname === user.nickname) {
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    setNicknameError('')

    try {
      // 닉네임 중복 확인
      const { data: existingUser } = await supabase
        .from('users')
        .select('nickname')
        .eq('nickname', newNickname.trim())
        .neq('id', user.id)
        .single()

      if (existingUser) {
        setNicknameError('이미 사용 중인 닉네임입니다')
        setIsSaving(false)
        return
      }

      // 닉네임 변경
      const { error } = await supabase
        .from('users')
        .update({ 
          nickname: newNickname.trim(),
          nickname_updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (error) throw error

      // 사용자 정보 업데이트
      setUser(prev => prev ? {
        ...prev,
        nickname: newNickname.trim(),
        nickname_updated_at: new Date().toISOString()
      } : null)

      setIsEditing(false)
      toast.success('닉네임이 변경되었습니다')
    } catch (error) {
      console.error('Nickname change error:', error)
      toast.error('닉네임 변경 중 오류가 발생했습니다')
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      router.push('/')
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

  if (!user) return null

  const canChange = canChangeNickname(user.nickname_updated_at)
  const nextChangeDate = getNextChangeDate(user.nickname_updated_at)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center">
          <button
            onClick={() => router.back()}
            className="p-2 mr-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">설정</h1>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* 프로필 정보 */}
        <div className="card p-6 mb-6">
          <div className="flex items-center mb-6">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mr-4">
              <UserIcon className="w-8 h-8 text-primary-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{user.nickname}</h2>
              <p className="text-gray-600">{user.department}</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* 실명 (변경 불가) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                실명
              </label>
              <input
                type="text"
                value={user.name}
                disabled
                className="input-field bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                실명은 변경할 수 없습니다
              </p>
            </div>

            {/* 이메일 (변경 불가) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                이메일
              </label>
              <input
                type="email"
                value={user.email}
                disabled
                className="input-field bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                이메일은 변경할 수 없습니다
              </p>
            </div>

            {/* 전화번호 (변경 불가) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                전화번호
              </label>
              <input
                type="tel"
                value={user.phone}
                disabled
                className="input-field bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                전화번호는 변경할 수 없습니다
              </p>
            </div>

            {/* 닉네임 (변경 가능, 제한 있음) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                닉네임
              </label>
              {isEditing ? (
                <div>
                  <input
                    type="text"
                    value={newNickname}
                    onChange={(e) => {
                      setNewNickname(e.target.value)
                      setNicknameError('')
                    }}
                    className={`input-field ${nicknameError ? 'border-red-500' : ''}`}
                    placeholder="새 닉네임을 입력하세요"
                    maxLength={10}
                  />
                  {nicknameError && (
                    <div className="flex items-center mt-2 text-red-500 text-sm">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      {nicknameError}
                    </div>
                  )}
                  <div className="flex space-x-2 mt-3">
                    <button
                      onClick={handleNicknameChange}
                      disabled={isSaving || !newNickname.trim()}
                      className="btn-primary text-sm px-4 py-2 flex items-center"
                    >
                      {isSaving ? (
                        <>
                          <div className="loading-spinner mr-2" />
                          저장 중...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          저장
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditing(false)
                        setNewNickname(user.nickname)
                        setNicknameError('')
                      }}
                      className="btn-secondary text-sm px-4 py-2"
                      disabled={isSaving}
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={user.nickname}
                      disabled
                      className="input-field bg-gray-50 text-gray-500 cursor-not-allowed flex-1 mr-3"
                    />
                    <button
                      onClick={() => setIsEditing(true)}
                      disabled={!canChange}
                      className={`px-4 py-2 text-sm font-medium rounded-lg ${
                        canChange 
                          ? 'bg-primary-600 hover:bg-primary-700 text-white' 
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      변경
                    </button>
                  </div>
                  
                  {!canChange && nextChangeDate && (
                    <div className="flex items-center mt-2 text-red-500 text-sm">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      {nextChangeDate.toLocaleDateString('ko-KR')} 이후 변경 가능합니다
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-500 mt-1">
                    변경 후 2주간 재변경 불가
                  </p>
                </div>
              )}
            </div>

            {/* 학과 (변경 불가) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                학과
              </label>
              <input
                type="text"
                value={user.department}
                disabled
                className="input-field bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                학과는 가입 후 변경할 수 없습니다
              </p>
            </div>
          </div>
        </div>

        {/* 관리자 문의 */}
        <div className="card p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">관리자 문의</h3>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">문의사항이 있으신가요?</p>
            <p className="text-sm font-medium text-primary-600">
              인스타그램 @0_min._.00 으로 DM 주세요
            </p>
          </div>
        </div>

        {/* 로그아웃 버튼 */}
        <div className="card p-6">
          <button
            onClick={handleLogout}
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors"
          >
            로그아웃
          </button>
        </div>

        {/* 하단 정보 */}
        <div className="text-center text-sm text-gray-500 mt-8">
          <p>같이타 v1.0.0</p>
          <p className="mt-2">가천대 통학 동행 플랫폼</p>
        </div>
      </div>
    </div>
  )
}
