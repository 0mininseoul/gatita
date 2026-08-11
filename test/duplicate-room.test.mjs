import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

function loadDuplicateRoom() {
  const source = readFileSync(join(process.cwd(), 'lib/duplicateRoom.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })

  const module = { exports: {} }
  // lib/duplicateRoom.ts는 순수 함수만 두는 파일이라 원래 import가 없어야 한다.
  // 알 수 없는 import가 들어오면 즉시 throw해, 나중에 누군가 DB·네트워크
  // 의존성을 몰래 추가해도 이 테스트가 감지하도록 한다 (route-alert-conditions.test.mjs 관례).
  const require = (specifier) => {
    throw new Error(`Unexpected import in test: ${specifier}`)
  }

  new Function('require', 'module', 'exports', outputText)(require, module, module.exports)
  return module.exports
}

const target = {
  fromLocation: '가천대역_1번출구',
  toLocation: 'AI공학관',
  departureDate: '2026-08-11',
  departureTime: '14:30',
}

test('같은 경로·같은 출발일시의 active 방을 찾는다', () => {
  const { findDuplicateActiveRoom } = loadDuplicateRoom()

  const rooms = [
    {
      id: 'room-1',
      from_location: '가천대역_1번출구',
      to_location: 'AI공학관',
      departure_date: '2026-08-11',
      departure_time: '14:30:00',
      status: 'active',
    },
  ]

  const result = findDuplicateActiveRoom(rooms, target)
  assert.equal(result?.id, 'room-1')
})

test('DB에서 내려온 HH:MM:SS 형식과 폼의 HH:MM 형식을 같은 시각으로 취급한다', () => {
  const { findDuplicateActiveRoom } = loadDuplicateRoom()

  const rooms = [
    {
      id: 'room-1',
      from_location: target.fromLocation,
      to_location: target.toLocation,
      departure_date: target.departureDate,
      departure_time: '14:30:45', // 초 단위가 붙어 있어도 HH:MM만 비교한다
      status: 'active',
    },
  ]

  assert.equal(findDuplicateActiveRoom(rooms, target)?.id, 'room-1')
  assert.equal(
    findDuplicateActiveRoom(rooms, { ...target, departureTime: '14:30:00' })?.id,
    'room-1',
  )
})

test('경로·날짜·시각 중 하나라도 다르면 매치하지 않는다', () => {
  const { findDuplicateActiveRoom } = loadDuplicateRoom()

  const base = {
    id: 'room-1',
    from_location: target.fromLocation,
    to_location: target.toLocation,
    departure_date: target.departureDate,
    departure_time: '14:30:00',
    status: 'active',
  }

  assert.equal(
    findDuplicateActiveRoom([{ ...base, from_location: '제2기숙사' }], target),
    null,
  )
  assert.equal(
    findDuplicateActiveRoom([{ ...base, to_location: '제2기숙사' }], target),
    null,
  )
  assert.equal(
    findDuplicateActiveRoom([{ ...base, departure_date: '2026-08-12' }], target),
    null,
  )
  assert.equal(
    findDuplicateActiveRoom([{ ...base, departure_time: '14:31:00' }], target),
    null,
  )
})

test('닫힌(closed) 방은 중복으로 취급하지 않는다', () => {
  const { findDuplicateActiveRoom } = loadDuplicateRoom()

  const rooms = [
    {
      id: 'room-closed',
      from_location: target.fromLocation,
      to_location: target.toLocation,
      departure_date: target.departureDate,
      departure_time: '14:30:00',
      status: 'closed',
    },
  ]

  assert.equal(findDuplicateActiveRoom(rooms, target), null)
})

test('status 필드가 없는 목록(이미 active만 조회한 경우)은 그대로 매치한다', () => {
  const { findDuplicateActiveRoom } = loadDuplicateRoom()

  const rooms = [
    {
      id: 'room-1',
      from_location: target.fromLocation,
      to_location: target.toLocation,
      departure_date: target.departureDate,
      departure_time: '14:30:00',
    },
  ]

  assert.equal(findDuplicateActiveRoom(rooms, target)?.id, 'room-1')
})

test('빈 목록이면 null을 반환한다', () => {
  const { findDuplicateActiveRoom } = loadDuplicateRoom()
  assert.equal(findDuplicateActiveRoom([], target), null)
})

test('POSTGRES_UNIQUE_VIOLATION_CODE는 Postgres 유니크 위반 코드(23505)다', () => {
  const { POSTGRES_UNIQUE_VIOLATION_CODE } = loadDuplicateRoom()
  assert.equal(POSTGRES_UNIQUE_VIOLATION_CODE, '23505')
})

// I-4: 기존 방이 가득 찬 상태에서 "그 방으로 입장해주세요" → "채팅방이 가득 찼습니다"로
// 이어지는 막다른 안내를 막기 위한 판정. HomeClient.tsx의 promptDuplicateRoom이 이
// 값으로 "그 방으로 이동" 버튼 노출 여부와 메시지를 분기한다.
test('isDuplicateRoomFull: 참여자 수가 정원과 같거나 넘으면 가득 찬 것으로 판정한다', () => {
  const { isDuplicateRoomFull } = loadDuplicateRoom()

  assert.equal(
    isDuplicateRoomFull({ participants: [{ id: 'p1' }, { id: 'p2' }], max_participants: 4 }),
    false,
  )
  assert.equal(
    isDuplicateRoomFull({
      participants: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }],
      max_participants: 4,
    }),
    true,
  )
})

test('isDuplicateRoomFull: participants가 없거나 빈 배열이면 가득 차지 않은 것으로 판정한다', () => {
  const { isDuplicateRoomFull } = loadDuplicateRoom()

  assert.equal(isDuplicateRoomFull({ participants: undefined, max_participants: 4 }), false)
  assert.equal(isDuplicateRoomFull({ participants: null, max_participants: 4 }), false)
  assert.equal(isDuplicateRoomFull({ participants: [], max_participants: 4 }), false)
})

test('getDuplicateRoomMessage: 가득 찬 방과 그렇지 않은 방의 안내 문구가 서로 다르고 모순되지 않는다', () => {
  const { getDuplicateRoomMessage, DUPLICATE_ROOM_MESSAGE, DUPLICATE_ROOM_FULL_MESSAGE } = loadDuplicateRoom()

  assert.equal(getDuplicateRoomMessage(false), DUPLICATE_ROOM_MESSAGE)
  assert.equal(getDuplicateRoomMessage(true), DUPLICATE_ROOM_FULL_MESSAGE)
  assert.notEqual(DUPLICATE_ROOM_MESSAGE, DUPLICATE_ROOM_FULL_MESSAGE)
  // 가득 찬 방 메시지는 "그 방으로 입장해주세요"처럼 결국 정원 가드에 막히는 안내를
  // 포함하면 안 되고, 다른 시각으로 새로 만들라는 실행 가능한 대안을 줘야 한다.
  assert.match(DUPLICATE_ROOM_FULL_MESSAGE, /시각/)
})
