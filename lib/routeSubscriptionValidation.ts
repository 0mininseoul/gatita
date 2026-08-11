// 경로 구독 API(POST /api/routes, PATCH /api/routes/[id])가 공유하는 입력 검증
// 순수 함수. lib/routeAlerts.ts와 동일한 관례로 순수 함수만 두어(DB·네트워크 의존
// 없음) 두 라우트가 같은 판정 로직을 거치게 하고, 실제로 함수를 호출해 테스트할
// 수 있게 한다.
//
// PATCH는 전 필드가 옵셔널인 "부분 업데이트" 계약이다. notify_from/notify_to처럼
// 페어로 다뤄야 하는 필드에서 "키가 아예 없음"(undefined)과 "명시적으로 null로
// 초기화"를 구분하지 못하면, { notify_enabled: false }만 보내는 흔한 알림 on/off
// 토글 요청까지 "시작 시각과 종료 시각을 함께 설정해주세요"라는 엉뚱한 400으로
// 거부하게 된다. resolveNotifyTimeRange가 이 구분을 책임진다.

export type ValidationError = { ok: false; error: string }

// ---- 출발지/도착지 ----

export type RoutePairResult =
  | { ok: true; from: string; to: string }
  | ValidationError

export function validateRoutePair(
  from: unknown,
  to: unknown,
  validLocations: readonly string[],
  isRestrictedPair: (from: string, to: string) => boolean,
): RoutePairResult {
  if (
    typeof from !== 'string' ||
    typeof to !== 'string' ||
    !validLocations.includes(from) ||
    !validLocations.includes(to)
  ) {
    return { ok: false, error: '출발지와 도착지를 선택해주세요' }
  }
  if (from === to || isRestrictedPair(from, to)) {
    return { ok: false, error: '선택할 수 없는 경로입니다' }
  }
  return { ok: true, from, to }
}

// ---- 알림 시간 구간 (notify_from / notify_to) ----

export type NotifyTimeRangeResult =
  | { ok: true; provided: false }
  | { ok: true; provided: true; notifyFrom: string | null; notifyTo: string | null }
  | ValidationError

// body에 notify_from/notify_to 키가 "둘 다 없음"(provided:false 반환 — PATCH에서는
// 시간 설정을 건드리지 않겠다는 뜻) / "둘 다 있음"(provided:true, 정규화된 값 반환)
// / "하나만 있음"(에러)의 세 갈래로만 나눈다. presence(키 존재 여부) 기준이라
// PATCH의 부분 업데이트에도, POST가 두 값을 함께 다루는 경우에도 동일하게
// 맞아떨어진다 — POST에서 둘 다 생략하면 자연히 종일 구독(둘 다 null)이 된다.
export function resolveNotifyTimeRange(body: Record<string, unknown>): NotifyTimeRangeResult {
  const hasFrom = 'notify_from' in body
  const hasTo = 'notify_to' in body

  if (!hasFrom && !hasTo) return { ok: true, provided: false }
  if (hasFrom !== hasTo) {
    return { ok: false, error: '시작 시각과 종료 시각을 함께 설정해주세요' }
  }

  const notifyFrom = (body.notify_from ?? null) as string | null
  const notifyTo = (body.notify_to ?? null) as string | null

  // isWithinNotifyWindow(lib/routeAlerts.ts)는 notify_from > notify_to일 때만
  // 자정 넘김으로 해석한다. 두 값이 같으면(예: 09:00~09:00) 그 정확히 1분만
  // 통과하는 사실상 죽은 구독이 되므로, 사용자가 알림이 온다고 믿는 조용한
  // 실패를 막기 위해 여기서 막는다. 자정을 넘는 구간(예: 22:00~02:00)은 from !==
  // to 이므로 이 검사에 걸리지 않고 통과한다.
  if (notifyFrom !== null && notifyFrom === notifyTo) {
    return { ok: false, error: '시작 시각과 종료 시각을 다르게 설정해주세요' }
  }

  return { ok: true, provided: true, notifyFrom, notifyTo }
}

// ---- 알림 요일 (notify_weekdays) ----

export type NotifyWeekdaysResult =
  | { provided: true; weekdays: number[] }
  | { provided: false }

export function resolveNotifyWeekdays(body: Record<string, unknown>): NotifyWeekdaysResult {
  if (Array.isArray(body.notify_weekdays) && body.notify_weekdays.length > 0) {
    return { provided: true, weekdays: body.notify_weekdays as number[] }
  }
  return { provided: false }
}

export const DEFAULT_NOTIFY_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]

// ---- POST /api/routes 전용 조합 ----

export type RouteCreateInput = {
  from: string
  to: string
  notifyFrom: string | null
  notifyTo: string | null
  weekdays: number[]
}

export type RouteCreateResult =
  | { ok: true; input: RouteCreateInput }
  | ValidationError

export function buildRouteCreateInput(
  body: Record<string, unknown>,
  validLocations: readonly string[],
  isRestrictedPair: (from: string, to: string) => boolean,
): RouteCreateResult {
  const pair = validateRoutePair(body.from_location, body.to_location, validLocations, isRestrictedPair)
  if (!pair.ok) return pair

  const timeRange = resolveNotifyTimeRange(body)
  if (!timeRange.ok) return timeRange

  const weekdays = resolveNotifyWeekdays(body)

  return {
    ok: true,
    input: {
      from: pair.from,
      to: pair.to,
      notifyFrom: timeRange.provided ? timeRange.notifyFrom : null,
      notifyTo: timeRange.provided ? timeRange.notifyTo : null,
      weekdays: weekdays.provided ? weekdays.weekdays : DEFAULT_NOTIFY_WEEKDAYS,
    },
  }
}

// ---- PATCH /api/routes/[id] 전용 조합 ----

export type RouteUpdatePatch = {
  notify_enabled?: boolean
  notify_from?: string | null
  notify_to?: string | null
  notify_weekdays?: number[]
}

export type RouteUpdateResult =
  | { ok: true; patch: RouteUpdatePatch }
  | ValidationError

export function buildRouteUpdatePatch(body: Record<string, unknown>): RouteUpdateResult {
  const patch: RouteUpdatePatch = {}

  if (typeof body.notify_enabled === 'boolean') {
    patch.notify_enabled = body.notify_enabled
  }

  const timeRange = resolveNotifyTimeRange(body)
  if (!timeRange.ok) return timeRange
  if (timeRange.provided) {
    patch.notify_from = timeRange.notifyFrom
    patch.notify_to = timeRange.notifyTo
  }

  const weekdays = resolveNotifyWeekdays(body)
  if (weekdays.provided) {
    patch.notify_weekdays = weekdays.weekdays
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: '변경할 내용이 없습니다' }
  }

  return { ok: true, patch }
}
