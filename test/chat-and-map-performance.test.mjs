import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test('chat message helpers expose incremental upsert with optimistic reconcile', () => {
  const source = readProjectFile('lib/chat/messages.ts')

  assert.match(source, /export function splitMessages/)
  assert.match(source, /export function upsertMessage/)
  assert.match(source, /export function extractHostAppearanceFromMessage/)
  // 같은 id면 교체(멱등), 실제 행이면 temp 메시지를 reconcile 해야 한다
  assert.match(source, /isOptimisticMessageId\(message\.id\)/)
  assert.match(source, /message\.content === incoming\.content/)
})

test('chat room applies realtime messages incrementally, not by full refetch', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  // 실시간 메시지는 증분 반영
  assert.match(source, /applyIncomingMessage/)
  assert.match(source, /void applyIncomingMessage\(payload\.new as Message\)/)

  // 메시지 채널이 전체 재조회 핸들러를 다시 쓰면 안 된다
  assert.doesNotMatch(source, /handleRealtimeRefresh/)

  // 전송 후 전체 메시지 재조회 / 메시지 브로드캐스트가 없어야 한다
  assert.doesNotMatch(source, /broadcastRoomSync\('message'\)/)
  assert.doesNotMatch(source, /broadcastRoomSync\('host-guide'\)/)
  assert.match(source, /\.select\('id, room_id, user_id, content, created_at'\)\s*\n\s*\.single\(\)/)

  // 작성자 캐시로 매 메시지마다 전체 작성자 재조회를 피한다
  assert.match(source, /authorsCacheRef/)
  assert.match(source, /ensureAuthors/)

  // 인증 왕복 1회 절감: getUser() 대신 getSession()
  assert.match(source, /supabase\.auth\.getSession\(\)/)
  assert.doesNotMatch(source, /supabase\.auth\.getUser\(\)/)
})

test('map replaces 30s polling with a realtime subscription', () => {
  const source = readProjectFile('app/page.tsx')

  // 30초 전체 폴링 제거
  assert.doesNotMatch(source, /setInterval\(loadMapRooms, 30000\)/)
  // 실시간 구독으로 대체
  assert.match(source, /\.channel\('map-rooms'\)/)
  assert.match(source, /table: 'chat_rooms'/)
})
