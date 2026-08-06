// `/routes` 화면(app/routes/page.tsx)이 쓰는 요약·시간선택 순수 함수.
// lib/routeAlerts.ts / lib/routeSubscriptionValidation.ts와 같은 관례로 DB·네트워크
// 의존 없이 순수 함수만 두어, 소스 패턴이 아니라 실제로 함수를 호출하는 테스트로
// 커버한다(test/route-summary-helpers.test.mjs).

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

export const WEEKDAY_PRESETS = {
  everyday: [0, 1, 2, 3, 4, 5, 6],
  weekday: [1, 2, 3, 4, 5],
  weekend: [0, 6],
} as const

function sortedKey(days: readonly number[]): string {
  return [...days].sort((a, b) => a - b).join(',')
}

// 요일 배열을 "매일" / "평일" / "주말" / "월·수·금" 같은 한 줄 요약으로 바꾼다.
// 순서·중복은 무시하고 집합으로만 비교한다.
export function summarizeWeekdays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  const key = sorted.join(',')

  if (key === sortedKey(WEEKDAY_PRESETS.everyday)) return '매일'
  if (key === sortedKey(WEEKDAY_PRESETS.weekday)) return '평일'
  if (key === sortedKey(WEEKDAY_PRESETS.weekend)) return '주말'
  if (sorted.length === 0) return '선택 안 함'

  return sorted.map((d) => WEEKDAY_LABELS[d]).join('·')
}

// notify_from/notify_to('HH:MM:SS' | null)를 "17:00~20:00" 또는 "종일"로 요약한다.
export function summarizeWindow(from: string | null, to: string | null): string {
  if (!from || !to) return '종일'
  return `${from.slice(0, 5)}~${to.slice(0, 5)}`
}

// 두 요일 배열이 같은 집합인지 (순서 무관) 비교. 요일 프리셋 버튼의 활성 상태 판정에 쓴다.
export function weekdaysEqual(a: number[], b: number[]): boolean {
  return sortedKey(a) === sortedKey(b)
}

function toMinutesOfDay(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function minutesToTime(totalMinutes: number): string {
  // 24시간(1440분) 기준으로 감아, 자정을 넘겨도 항상 유효한 'HH:MM'을 돌려준다.
  const normalized = ((totalMinutes % 1440) + 1440) % 1440
  const hour = Math.floor(normalized / 60)
  const minute = normalized % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

// 알림 시작/종료 시각 중 하나를 사용자가 바꿨을 때, 두 값이 같아지는 조합을
// 선택 단계에서 원천 차단한다. `notify_from === notify_to`는 서버(400)도 막지만,
// 자정 넘김이 아닌 한 "그 1분만 통과"하는 사실상 죽은 구독이 되므로(Task 6 리뷰에서
// 발견) UI에서 애초에 고를 수 없게 한다. 같아지면 방금 바꾼 값의 반대편을 1분
// 밀어내 항상 from !== to를 유지한다 — 이전 상태가 유효(from !== to)했다면
// 이 함수가 반환하는 다음 상태도 항상 유효하다.
export function resolveNotifyWindowChange(
  field: 'from' | 'to',
  current: { from: string; to: string },
  nextValue: string,
): { from: string; to: string } {
  if (field === 'from') {
    if (nextValue === current.to) {
      return { from: nextValue, to: minutesToTime(toMinutesOfDay(nextValue) + 1) }
    }
    return { from: nextValue, to: current.to }
  }

  if (nextValue === current.from) {
    return { from: current.from, to: minutesToTime(toMinutesOfDay(nextValue) + 1) }
  }
  return { from: current.from, to: nextValue }
}

// <input type="time">이 주는 'HH:MM'을 API/DB가 쓰는 'HH:MM:SS'로 바꾼다.
export function toNotifyTimeSeconds(time: string): string {
  return `${time}:00`
}
