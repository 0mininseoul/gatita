// 같은 경로(from/to) + 같은 출발일시(date/time) 조합의 활성(active) 방을 찾는 순수 함수.
// DB 유니크 인덱스(chat_rooms_active_route_departure_unique_idx, supabase_schema.sql)와
// 정확히 같은 판정 기준을 클라이언트에서 먼저 적용해, insert가 막히기 전에 "왜 안 되는지"를
// 보여주고 이미 있는 방으로 안내할 수 있게 한다.
//
// 주의: 이 함수는 UX를 위한 사전 안내일 뿐 동시성 방어선이 아니다. 두 사람이 같은 순간에
// 같은 방을 만들면 둘 다 이 검사를 통과할 수 있으므로, DB 유니크 인덱스 위반(23505)을
// 항상 함께 처리해야 한다 — 호출부(components/HomeClient.tsx handleCreateMapRoom) 참고.

export type DuplicateRoomCandidate = {
  from_location: string
  to_location: string
  departure_date: string
  departure_time: string
  status?: string
}

export type DuplicateRoomTarget = {
  fromLocation: string
  toLocation: string
  departureDate: string
  departureTime: string
}

// departure_time은 DB에서 'HH:MM:SS'로 내려오는 반면 폼 입력값은 'HH:MM'라 형식이
// 어긋난다. 비교 전에 앞 5자(HH:MM)로 맞춰 초 단위 유무와 무관하게 판정한다.
function normalizeTime(time: string): string {
  return time.slice(0, 5)
}

export function findDuplicateActiveRoom<T extends DuplicateRoomCandidate>(
  rooms: readonly T[],
  target: DuplicateRoomTarget,
): T | null {
  const targetTime = normalizeTime(target.departureTime)

  return (
    rooms.find((room) => {
      // status가 없는 목록(예: 이미 active만 걸러 조회한 목록)은 값이 없을 수 있으므로
      // status가 존재할 때만 active 여부를 확인한다.
      if (room.status && room.status !== 'active') return false

      return (
        room.from_location === target.fromLocation &&
        room.to_location === target.toLocation &&
        room.departure_date === target.departureDate &&
        normalizeTime(room.departure_time) === targetTime
      )
    }) ?? null
  )
}

// Postgres 유니크 위반 에러 코드. chat_rooms_active_route_departure_unique_idx 위반 시
// 이 코드로 insert가 실패한다.
export const POSTGRES_UNIQUE_VIOLATION_CODE = '23505'

export const DUPLICATE_ROOM_MESSAGE = '같은 시각·경로로 이미 열린 방이 있어요. 그 방으로 입장해주세요.'

// I-4: 위 메시지로 "그 방으로 입장해주세요"라고 안내해놓고, 그 방이 이미 가득 차서
// joinExistingRoom의 정원 가드("채팅방이 가득 찼습니다")에 다시 막히면 두 메시지가
// 모순되고 이용자는 나갈 길이 없다. 가득 찬 방인지를 먼저 판정해 문구를 분기한다.
export type DuplicateRoomOccupancy = {
  participants?: { id: string }[] | null
  max_participants: number
}

export function isDuplicateRoomFull(room: DuplicateRoomOccupancy): boolean {
  return (room.participants?.length ?? 0) >= room.max_participants
}

export const DUPLICATE_ROOM_FULL_MESSAGE =
  '같은 시각·경로로 이미 열린 방이 있는데 정원이 가득 찼어요. 출발 시각을 조금 바꿔서 새로 만들어주세요.'

export function getDuplicateRoomMessage(isFull: boolean): string {
  return isFull ? DUPLICATE_ROOM_FULL_MESSAGE : DUPLICATE_ROOM_MESSAGE
}
