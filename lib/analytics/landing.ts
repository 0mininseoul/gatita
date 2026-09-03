export const LANDING_VIEW_DEDUPE_MS = 30 * 60 * 1000

type AnonymousLandingState = {
  loading: boolean
  hasResolvedAuthSession: boolean
  hasAuthenticatedSession: boolean
  hasEnteredApp: boolean
  authMode: string | null
  lastTrackedAt: number | null
  now: number
}

export function shouldTrackAnonymousLanding(state: AnonymousLandingState) {
  if (
    state.loading
    || !state.hasResolvedAuthSession
    || state.hasAuthenticatedSession
    || state.hasEnteredApp
    || state.authMode === 'signup'
  ) {
    return false
  }

  if (state.lastTrackedAt === null || !Number.isFinite(state.lastTrackedAt)) return true

  return state.now - state.lastTrackedAt >= LANDING_VIEW_DEDUPE_MS
}
