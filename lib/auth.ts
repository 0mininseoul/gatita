export const GACHON_EMAIL_DOMAIN = '@gachon.ac.kr'
export const GACHON_GOOGLE_DOMAIN = 'gachon.ac.kr'
export const GACHON_ACCOUNT_HINT = '가천대학교 계정만 로그인 가능'
export const NON_GACHON_ACCOUNT_MESSAGE = '가천대학교 계정이 아니라서 로그인이 실패했습니다.'
export const AUTH_CALLBACK_ERROR_MESSAGE = '로그인 세션을 저장하지 못했습니다. Safari 설정에서 쿠키 허용 후 다시 시도해주세요.'
export const AUTH_CODE_MISSING_MESSAGE = '로그인 인증 정보를 받지 못했습니다. 다시 로그인해주세요.'

export const isGachonEmail = (email?: string | null): email is string =>
  typeof email === 'string' && email.toLowerCase().endsWith(GACHON_EMAIL_DOMAIN)

export const getGoogleOAuthOptions = () => ({
  redirectTo: `${window.location.origin}/auth/callback`,
  queryParams: {
    hd: GACHON_GOOGLE_DOMAIN,
  },
})
