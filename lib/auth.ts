export const GACHON_EMAIL_DOMAIN = '@gachon.ac.kr'
export const GACHON_GOOGLE_DOMAIN = 'gachon.ac.kr'
export const GACHON_ACCOUNT_HINT = '가천대학교 계정만 로그인 가능'
export const NON_GACHON_ACCOUNT_MESSAGE = '가천대학교 계정이 아니라서 로그인이 실패했습니다.'
export const AUTH_CALLBACK_ERROR_MESSAGE = '로그인 세션을 저장하지 못했습니다. Safari 설정에서 쿠키 허용 후 다시 시도해주세요.'
export const AUTH_CODE_MISSING_MESSAGE = '로그인 인증 정보를 받지 못했습니다. 다시 로그인해주세요.'

// Google은 '보안 브라우저 사용' 정책에 따라 임베디드 WebView(에브리타임·카카오톡 등
// 앱 내장 브라우저)에서의 OAuth 로그인을 차단합니다(403 disallowed_useragent).
// 유일한 해결책은 Chrome/Safari 같은 외부 브라우저에서 다시 여는 것입니다.
// (안내 문구는 로그인 버튼 클릭 시 page.tsx 의 toast 로 노출)

export type InAppBrowserInfo = {
  isInApp: boolean
  isIOS: boolean
  isAndroid: boolean
}

// userAgent 인자를 받도록 해서 순수 함수로 테스트 가능하게 둠. 미지정 시 navigator 사용.
export function detectInAppBrowser(userAgent?: string): InAppBrowserInfo {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  const isIOS = /iPhone|iPad|iPod/i.test(ua)
  const isAndroid = /Android/i.test(ua)

  const inAppPatterns = [
    // 에브리타임. 실제 iOS UA에 `everytimeApp` 토큰이 포함됨(2026-06 기준 캡처 확인). Android도 동일 브랜드 토큰 사용 추정.
    /Everytime/i,
    /KAKAOTALK/i, // 카카오톡
    /Instagram/i, // 인스타그램
    /\bFB(AN|AV|_IAB|IOS)\b/i, // 페이스북 / 메신저
    /NAVER\(inapp/i, // 네이버 앱
    /\bLine\//i, // 라인
    /DaumApps/i, // 다음 앱
    /; wv\)/i, // Android System WebView 표식
  ]
  const isInApp = inAppPatterns.some((pattern) => pattern.test(ua))

  return { isInApp, isIOS, isAndroid }
}

// 인앱 브라우저에서 외부 브라우저로 탈출 시도.
// Android는 intent 스킴으로 Chrome에서 강제 재오픈이 가능하지만,
// iOS는 프로그램으로 강제할 수 없어 호출부에서 안내 UI를 띄워야 한다('ios' 반환).
export function escapeInAppBrowser(targetUrl?: string): 'android' | 'ios' | 'noop' {
  if (typeof window === 'undefined') return 'noop'

  const { isInApp, isIOS } = detectInAppBrowser()
  if (!isInApp) return 'noop'

  const url = targetUrl ?? window.location.href

  if (!isIOS) {
    const withoutScheme = url.replace(/^https?:\/\//, '')
    window.location.href = `intent://${withoutScheme}#Intent;scheme=https;package=com.android.chrome;end`
    return 'android'
  }

  return 'ios'
}

export const isGachonEmail = (email?: string | null): email is string =>
  typeof email === 'string' && email.toLowerCase().endsWith(GACHON_EMAIL_DOMAIN)

function getSafeRedirectPath(redirectPath?: string) {
  if (!redirectPath) return ''
  if (!redirectPath.startsWith('/') || redirectPath.startsWith('//')) return ''
  return redirectPath
}

export function getGoogleOAuthOptions(redirectPath?: string) {
  const safeRedirectPath = getSafeRedirectPath(redirectPath)
  const callbackSearch = safeRedirectPath
    ? `?redirect=${encodeURIComponent(safeRedirectPath)}`
    : ''

  return {
    redirectTo: `${window.location.origin}/auth/callback${callbackSearch}`,
    queryParams: {
      hd: GACHON_GOOGLE_DOMAIN,
    },
  }
}

export function extractGachonProfileFromMetadata(metadata?: Record<string, unknown> | null) {
  const displayName = [
    metadata?.name,
    metadata?.full_name,
    metadata?.display_name,
  ].find((value): value is string => typeof value === 'string' && value.trim().length > 0)

  if (!displayName) {
    return {
      name: '',
      department: '',
    }
  }

  const [rawName, rawDepartment] = displayName.split('/').map((value) => value.trim())

  return {
    name: rawName || displayName.trim(),
    department: rawDepartment || '',
  }
}
