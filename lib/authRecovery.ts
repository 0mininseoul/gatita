// 클라이언트 세션과 서버 세션이 어긋났을 때의 복구 규칙.
//
// @supabase/ssr 브라우저 클라이언트는 세션을 쿠키(document.cookie)에 담고,
// getSession()은 네트워크 없이 그 쿠키만 읽는다. 그래서 액세스 토큰의 exp가 아직
// 남아 있으면 서버가 이미 그 세션을 무효화했더라도(리프레시 토큰 회전 경합으로
// 세션 패밀리가 폐기되는 경우 등) 클라이언트는 "로그인 상태"라고 판단한다.
//
// 이 상태에서 서버 라우트는 supabase.auth.getUser()로 토큰을 검증하므로 401을 낸다.
// 실패를 그냥 삼키면 hasAuthenticatedSession=true인 채로 랜딩이 그려지고, CTA를
// 눌러도 같은 401을 다시 만나 빠져나갈 수 없는 루프가 된다. 남은 액세스 토큰이
// 만료될 때까지(최대 1시간) 계속된다.
//
// 따라서 401/403은 "죽은 세션"으로 보고 로컬 쿠키를 비워 Google 로그인 버튼이
// 다시 나오게 하고, 그 밖의 실패(5xx·네트워크 단절 등)는 일시적인 것으로 보고
// 세션을 유지한 채 재시도할 수 있게 둔다.
export type AuthFailureRecovery = 'sign_out' | 'retry'

export const SESSION_REJECTED_MESSAGE = '로그인이 만료되었어요. 다시 로그인해주세요.'
export const PROFILE_CHECK_FAILED_MESSAGE = '계정 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.'

export function resolveAuthFailureRecovery(status?: number | null): AuthFailureRecovery {
  if (status === 401 || status === 403) return 'sign_out'
  return 'retry'
}
