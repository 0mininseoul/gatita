'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Copy, ExternalLink, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  IN_APP_BROWSER_IOS_GUIDE,
  IN_APP_BROWSER_NOTICE_BODY,
  IN_APP_BROWSER_NOTICE_TITLE,
  detectInAppBrowser,
  escapeInAppBrowser,
} from '@/lib/auth'

// 에브리타임 등 인앱 브라우저에서 진입했을 때 Google 로그인이 불가능함을 알리고,
// 외부 브라우저(Chrome/Safari)로 열도록 유도하는 배너.
export default function InAppBrowserNotice() {
  const [info, setInfo] = useState({ isInApp: false, isIOS: false })
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => {
    const detected = detectInAppBrowser()
    setInfo({ isInApp: detected.isInApp, isIOS: detected.isIOS })
  }, [])

  if (!info.isInApp) return null

  const handleOpenExternally = () => {
    if (info.isIOS) {
      setShowIOSGuide(true)
      return
    }
    // Android: Chrome에서 강제로 다시 열기
    escapeInAppBrowser()
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('링크를 복사했어요. 브라우저 주소창에 붙여넣어 주세요.')
    } catch {
      toast.error('링크 복사에 실패했어요. 주소창의 URL을 직접 복사해주세요.')
    }
  }

  return (
    <>
      <div
        role="alert"
        style={{
          width: '100%',
          maxWidth: '360px',
          margin: '0 auto 1rem',
          padding: '0.875rem 1rem',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.97)',
          border: '1px solid rgba(245, 158, 11, 0.55)',
          boxShadow: '0 10px 28px rgba(17, 24, 39, 0.18)',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
          <AlertTriangle className="w-5 h-5" style={{ color: '#d97706', flexShrink: 0, marginTop: '0.125rem' }} />
          <div>
            <p style={{ fontWeight: 800, color: '#111827', fontSize: '0.95rem', lineHeight: 1.35 }}>
              {IN_APP_BROWSER_NOTICE_TITLE}
            </p>
            <p style={{ marginTop: '0.25rem', color: '#4b5563', fontSize: '0.8125rem', lineHeight: 1.45 }}>
              {IN_APP_BROWSER_NOTICE_BODY}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenExternally}
          style={{
            marginTop: '0.75rem',
            width: '100%',
            minHeight: '2.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#111827',
            color: '#fff',
            fontSize: '0.9375rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <ExternalLink className="w-4 h-4" />
          {info.isIOS ? 'Safari로 여는 방법' : 'Chrome으로 열기'}
        </button>
      </div>

      {showIOSGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Safari로 여는 방법"
          onClick={() => setShowIOSGuide(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 70,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
            background: 'rgba(17, 24, 39, 0.55)',
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '340px',
              borderRadius: '16px',
              background: '#fff',
              padding: '1.25rem',
              boxShadow: '0 24px 60px rgba(17, 24, 39, 0.28)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontWeight: 800, color: '#111827', fontSize: '1.0625rem' }}>Safari로 여는 방법</h2>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setShowIOSGuide(false)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'transparent',
                  color: '#6b7280',
                  cursor: 'pointer',
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p style={{ marginTop: '0.75rem', color: '#374151', fontSize: '0.9375rem', lineHeight: 1.5 }}>
              {IN_APP_BROWSER_IOS_GUIDE}
            </p>

            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                marginTop: '1rem',
                width: '100%',
                minHeight: '2.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb',
                color: '#111827',
                fontSize: '0.9375rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Copy className="w-4 h-4" />
              링크 복사하기
            </button>
          </div>
        </div>
      )}
    </>
  )
}
