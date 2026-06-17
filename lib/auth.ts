export const GACHON_EMAIL_DOMAIN = '@gachon.ac.kr'
export const GACHON_GOOGLE_DOMAIN = 'gachon.ac.kr'
export const GACHON_ACCOUNT_HINT = '가천대학교 계정만 로그인 가능'
export const NON_GACHON_ACCOUNT_MESSAGE = '가천대학교 계정이 아니라서 로그인이 실패했습니다.'

export const isGachonEmail = (email?: string | null): email is string =>
  typeof email === 'string' && email.toLowerCase().endsWith(GACHON_EMAIL_DOMAIN)

export const getGoogleOAuthOptions = () => ({
  redirectTo: `${window.location.origin}/`,
  queryParams: {
    hd: GACHON_GOOGLE_DOMAIN,
  },
})
