import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

// 이 라우트는 DB 트리거(pg_net)가 공유 시크릿만으로 호출하는 내부 엔드포인트라
// 세션 검증이 없다. 실제로 웹훅을 실행하지 않고 소스를 읽어 패턴을 단언하는 방식은
// 이 프로젝트의 관례다 (test/location-points.test.mjs:286의
// 'room joins go through a server route ...' 테스트 참고).
function readRouteSource() {
  return readFileSync(
    join(process.cwd(), 'app/api/push/dispatch/route.ts'),
    'utf8',
  )
}

test('시크릿 검증은 본문 파싱·DB 조회보다 먼저 실행되어 room_id 분기도 함께 보호한다', () => {
  const source = readRouteSource()

  const secretCheckIndex = source.indexOf("request.headers.get('x-push-secret')")
  const bodyParseIndex = source.indexOf('await request.json()')
  const roomBranchIndex = source.indexOf('if (roomId) {')
  const adminQueryIndex = source.indexOf("admin\n    .from('messages')")

  assert.notEqual(secretCheckIndex, -1, '시크릿 검증 코드가 존재해야 한다')
  assert.notEqual(bodyParseIndex, -1)
  assert.notEqual(roomBranchIndex, -1)
  assert.notEqual(adminQueryIndex, -1)

  // 시크릿 검증이 본문 파싱보다, 본문 파싱이 room_id 분기 진입보다 앞서야 한다.
  // 즉 room_id 분기도 message_id 분기와 동일하게 시크릿 검증을 통과해야만 도달한다.
  assert.ok(secretCheckIndex < bodyParseIndex, '시크릿 검증이 본문 파싱보다 먼저여야 한다')
  assert.ok(bodyParseIndex < roomBranchIndex, '본문 파싱이 room_id 분기보다 먼저여야 한다')
  assert.ok(roomBranchIndex < adminQueryIndex, 'room_id 분기가 messages 테이블 조회보다 먼저 나와야 한다(같은 시크릿 검증을 공유)')

  // 두 분기 모두로 이어지는 dispatchPush 함수 자체는 단 하나이고, 그 함수 전체가
  // 시크릿 검증으로 시작한다 — 분기별로 검증을 따로 두지 않는다.
  assert.match(source, /async function dispatchPush\(request: Request\) \{\s*\n\s*if \(!DISPATCH_SECRET/)
})

test('room_id 분기는 shouldNotify를 호출하고 판정 로직을 재구현하지 않는다', () => {
  const source = readRouteSource()

  assert.match(source, /import \{ shouldNotify \} from '@\/lib\/routeAlerts'/)

  const dispatchRoomAlertMatch = source.match(/async function dispatchRoomAlert\([\s\S]*?\n\}/)
  assert.ok(dispatchRoomAlertMatch, 'dispatchRoomAlert 함수가 존재해야 한다')
  const fnBody = dispatchRoomAlertMatch[0]

  assert.match(fnBody, /shouldNotify\(/, 'shouldNotify를 호출해야 한다')
  // 자체 요일/시간대 판정을 재구현하지 않았는지 — 요일 배열 인덱싱이나 분(minute)
  // 계산 같은 판정 로직 흔적이 이 함수 안에 없어야 한다.
  assert.doesNotMatch(fnBody, /getUTCDay|notify_weekdays\.includes|toMinutes/)
})

test('room_id 분기는 방 생성자를 알림 수신자에서 제외한다', () => {
  const source = readRouteSource()

  const dispatchRoomAlertMatch = source.match(/async function dispatchRoomAlert\([\s\S]*?\n\}/)
  assert.ok(dispatchRoomAlertMatch)
  const fnBody = dispatchRoomAlertMatch[0]

  assert.match(fnBody, /sub\.user_id !== room\.created_by/)
})

test('만료된 구독 정리(404\\/410)는 공유 헬퍼로 옮겨졌지만 여전히 존재한다', () => {
  const source = readRouteSource()

  assert.match(source, /async function sendToSubscriptions\(/)
  assert.match(source, /statusCode === 404 \|\| statusCode === 410/)
  assert.match(source, /admin\.from\('push_subscriptions'\)\.delete\(\)\.in\('endpoint', staleEndpoints\)/)

  // 두 분기 모두 이 공유 헬퍼를 통해서만 발송한다 — 로직이 갈라지지 않았는지 확인.
  const sendCallCount = (source.match(/sendToSubscriptions\(admin, recipientIds, payload\)/g) ?? []).length
  assert.equal(sendCallCount, 2, '메시지 분기와 room_id 분기 모두 sendToSubscriptions를 호출해야 한다')
})

test('기존 message_id 분기는 그대로 남아있다', () => {
  const source = readRouteSource()

  assert.match(source, /message_id required|message_id or room_id required/)
  assert.match(source, /\.from\('messages'\)/)
  assert.match(source, /\.from\('room_participants'\)\.select\('user_id'\)\.eq\('room_id', message\.room_id\)/)
  assert.match(source, /filter\(\(userId\) => userId !== message\.user_id\)/)
  assert.match(source, /ok: true, skipped: 'message-not-found'/)
})

test('room_id 없이 room-not-found 스켈레톤 응답 형식을 유지한다', () => {
  const source = readRouteSource()

  assert.match(source, /ok: true, skipped: 'room-not-found'/)
  assert.match(source, /\.from\('chat_rooms'\)\s*\n\s*\.select\('id, from_location, to_location, created_by, departure_date, departure_time'\)/)
})
