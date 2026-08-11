// followup 스펙 8-2: 같은 경로(from+to)로 방을 2회 이상 만들었는데 아직 그 경로를
// 구독하지 않은 이용자에게, 방 생성 성공 직후 구독을 유도한다. 46일 실측에서 방을
// 2개 이상 만든 9명 중 7명(78%)이 오직 한 경로만 반복했다 — 반복이 확인된 시점이
// 구독 의사가 가장 높다는 근거다.
//
// "2회 이상 + 미구독 + 미거절" 판정만 순수 함수로 뽑는다. 실제 조회(같은 경로로 만든
// 방 개수, GET /api/routes, localStorage)는 components/HomeClient.tsx가 하고, 이 함수는
// 그 결과를 조합해 프롬프트를 띄울지만 결정한다. lib/duplicateRoom.ts와 같은 관례.

export type RepeatRoutePromptInput = {
  // created_by=나 + 같은 from/to로 만든 방 개수. 방금 막 만든 방을 포함한 값이어야
  // "2번째"부터 true가 된다.
  createdRoomCount: number
  // GET /api/routes 응답에 이 경로(from+to)가 이미 있는지.
  isAlreadySubscribed: boolean
  // 이 경로에 대해 이전에 프롬프트를 거절(닫기)한 적이 있는지 (localStorage 기반).
  wasPreviouslyDismissed: boolean
}

export function shouldPromptRepeatRouteSubscription(input: RepeatRoutePromptInput): boolean {
  return input.createdRoomCount >= 2 && !input.isAlreadySubscribed && !input.wasPreviouslyDismissed
}

// 경로별 "거절했음" 기억 localStorage 키. from/to 조합마다 따로 저장해야 "이 경로는
// 거절했지만 다른 경로는 처음 보는" 상황을 구분할 수 있다 — 한 번 거절했다고 모든
// 경로에 대해 다시 묻지 않으면, 정작 반복 중인 다른 경로의 구독 유도 기회를 잃는다.
export function buildRepeatRoutePromptDismissKey(from: string, to: string): string {
  return `gatita:repeat_route_prompt:dismissed:${from}>${to}`
}
