// `/routes` 화면(app/routes/page.tsx)이 쓰는 요약·시간선택 순수 함수.
// lib/routeAlerts.ts / lib/routeSubscriptionValidation.ts와 같은 관례로 DB·네트워크
// 의존 없이 순수 함수만 두어, 소스 패턴이 아니라 실제로 함수를 호출하는 테스트로
// 커버한다(test/route-summary-helpers.test.mjs).

// /routes 화면(app/routes/page.tsx)이 진입 시 기록하는 마지막 확인 시각 키.
// FAB 미확인 배지(components/HomeClient.tsx)가 같은 키를 읽어 "새로 열린 방" 표시를
// 판정한다 — 두 파일이 각자 리터럴로 선언하면 오타 하나로 배지가 영원히 켜진 채
// 남는 조용한 실패가 생긴다(I-4). 이 상수를 유일한 소스로 두고 양쪽에서 import한다.
export const ROUTES_SEEN_STORAGE_KEY = 'gatita:routes:seen_at'

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

// 알림 시작·종료 시각이 서로 달라 유효한 구간인지 판정한다. `notify_from === notify_to`는
// 서버(lib/routeSubscriptionValidation.ts)도 400으로 막지만, 자정 넘김이 아닌 한 "그 1분만
// 통과"하는 사실상 죽은 구독이 되므로(Task 6 리뷰에서 발견) 클라이언트에서도 저장 전에
// 막는다. 값을 몰래 밀어내는 대신(초안이었으나 field==='to' 분기에서 사용자가 방금 고른
// 값 자체를 대체해버려 리뷰에서 지적됨), 출발지/도착지 충돌과 같은 패턴 — 인라인 에러를
// 띄우고 저장을 막는다 — 으로 통일한다.
export function isValidNotifyWindow(from: string, to: string): boolean {
  return from !== to
}

// <input type="time">이 주는 'HH:MM'을 API/DB가 쓰는 'HH:MM:SS'로 바꾼다.
export function toNotifyTimeSeconds(time: string): string {
  return `${time}:00`
}

// toNotifyTimeSeconds의 역방향. 구독을 수정할 때 DB의 'HH:MM:SS'를 <input type="time">이
// 받는 'HH:MM'으로 되돌린다. 종일 구독은 두 값이 null이라 여기서 빈 문자열을 주고,
// 호출부가 그 경우 기본 시간대(DEFAULT_WINDOW)를 대신 넣는다 — null을 그대로 input에
// 흘리면 제어 컴포넌트가 비제어로 바뀌며 경고가 난다.
export function toNotifyTimeInput(value: string | null): string {
  if (!value) return ''
  return value.slice(0, 5)
}
