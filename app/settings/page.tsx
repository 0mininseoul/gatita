'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User } from '@/lib/supabase'
import { ArrowLeft, User as UserIcon, AlertCircle, Check, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'

type DeleteStep = 'idle' | 'overview' | 'confirm'

const DELETE_CONFIRMATION_TEXT = '탈퇴합니다'

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [newNickname, setNewNickname] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [nicknameError, setNicknameError] = useState('')
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('idle')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const checkAuthAndLoadData = useCallback(async () => {
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
        .maybeSingle()
      
      if (userData) {
        setUser(userData)
        setNewNickname(userData.nickname)
      } else {
        router.push('/')
      }
    } catch (error) {
      console.error('Auth/data loading error:', error)
      router.push('/')
    } finally {
      setLoading(false)
    }
  }, [router, supabase])

  useEffect(() => {
    checkAuthAndLoadData()
  }, [checkAuthAndLoadData])

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
        .maybeSingle()

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

  const closeDeleteFlow = () => {
    if (isDeleting) return

    setDeleteStep('idle')
    setDeleteConfirmText('')
    setDeleteAcknowledged(false)
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim() !== DELETE_CONFIRMATION_TEXT || !deleteAcknowledged) return

    setIsDeleting(true)

    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmation: DELETE_CONFIRMATION_TEXT }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error ?? '계정을 삭제하지 못했습니다')
      }

      await supabase.auth.signOut()
      toast.success('계정이 탈퇴 처리되었습니다')
      router.push('/')
    } catch (error) {
      console.error('Delete account error:', error)
      toast.error(error instanceof Error ? error.message : '계정 탈퇴 중 오류가 발생했습니다')
    } finally {
      setIsDeleting(false)
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
  const canDeleteAccount = deleteConfirmText.trim() === '탈퇴합니다' && deleteAcknowledged

  return (
    <div className="min-h-screen app-bg">
      {/* Header */}
      <header className="app-header px-4 py-4">
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
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mr-4"
              style={{ backgroundImage: 'var(--brand-gradient)', boxShadow: '0 8px 20px rgba(39, 130, 255, 0.28)' }}
            >
              <UserIcon className="w-8 h-8 text-white" />
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
              ym5373@gachon.ac.kr 로 메일 주세요
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
          <div className="mt-4 flex items-center justify-center gap-4 text-xs">
            <Link href="/privacy" className="underline hover:text-gray-700">
              개인정보처리방침
            </Link>
            <Link href="/terms" className="underline hover:text-gray-700">
              서비스약관
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setDeleteStep('overview')}
            className="mt-6 text-[11px] font-medium text-gray-400 underline decoration-gray-300 underline-offset-2 transition hover:text-red-600 hover:decoration-red-300"
          >
            탈퇴하기
          </button>
        </div>
      </div>

      {deleteStep !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-4 pb-4 pt-16 sm:items-center sm:pb-16">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-red-600">계정 탈퇴</p>
                <h2 className="mt-1 text-lg font-extrabold text-gray-950">
                  {deleteStep === 'overview' ? '정말 탈퇴하시겠어요?' : '마지막 확인'}
                </h2>
              </div>
              <button
                type="button"
                aria-label="탈퇴 화면 닫기"
                onClick={closeDeleteFlow}
                disabled={isDeleting}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {deleteStep === 'overview' ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg bg-red-50 px-3 py-3 text-sm leading-6 text-red-900">
                  탈퇴하면 프로필, 참여 기록, 내가 만든 방, 메시지, 즐겨찾기 정보가 삭제됩니다. 삭제된 계정은 복구할 수 없습니다.
                </div>
                <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-gray-600">
                  <li>진행 중인 채팅방 참여가 해제됩니다.</li>
                  <li>내가 만든 활성 방은 함께 정리될 수 있습니다.</li>
                  <li>신고 및 안전 처리를 위해 필요한 기록은 운영상 필요한 기간 동안 보관될 수 있습니다.</li>
                </ul>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeDeleteFlow}
                    className="btn-secondary flex-1 py-2.5 text-sm"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteStep('confirm')}
                    className="inline-flex flex-1 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-100"
                  >
                    계속
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-800">
                    아래 문구를 정확히 입력해주세요: {DELETE_CONFIRMATION_TEXT}
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(event) => setDeleteConfirmText(event.target.value)}
                    className="input-field"
                    autoComplete="off"
                    disabled={isDeleting}
                  />
                </div>
                <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm leading-5 text-gray-700">
                  <input
                    type="checkbox"
                    checked={deleteAcknowledged}
                    onChange={(event) => setDeleteAcknowledged(event.target.checked)}
                    disabled={isDeleting}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-red-600 focus:ring-red-200"
                  />
                  <span>삭제 후 계정과 서비스 기록을 복구할 수 없다는 점을 이해했습니다.</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteStep('overview')}
                    disabled={isDeleting}
                    className="btn-secondary flex-1 py-2.5 text-sm"
                  >
                    이전
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={
                      isDeleting ||
                      !canDeleteAccount
                    }
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:bg-gray-300"
                  >
                    {isDeleting ? (
                      <>
                        <div className="loading-spinner mr-2" />
                        처리 중
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        탈퇴하기
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
