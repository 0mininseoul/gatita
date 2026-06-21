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

test('chat loads only the latest page of messages with load-older pagination', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')
  const helpers = readProjectFile('lib/chat/messages.ts')

  // 초기 로드는 전체가 아니라 최근 N개만
  assert.match(source, /const MESSAGE_PAGE_SIZE = \d+/)
  assert.match(source, /\.limit\(MESSAGE_PAGE_SIZE\)/)
  assert.match(source, /ascending: false/)
  // 이전 메시지 더보기
  assert.match(source, /loadOlderMessages/)
  assert.match(source, /hasMoreMessages/)
  assert.match(source, /이전 메시지 더보기/)
  assert.match(source, /prependOlderMessages/)
  // 방장 인상착의는 페이지 창 밖일 수 있어 별도 조회
  assert.match(source, /content\.like\.\$\{HOST_APPEARANCE_MESSAGE_PREFIX\}/)
  // prepend 시 스크롤 위치 보존 (맨 아래로 튀지 않음)
  assert.match(source, /pendingScrollRestoreRef/)
  assert.match(helpers, /export function prependOlderMessages/)
})

test('chat and map routes render an instant skeleton/loader during segment load', () => {
  const chatLoading = readProjectFile('app/rooms/[id]/loading.tsx')
  const mapLoading = readProjectFile('app/map/loading.tsx')

  assert.match(chatLoading, /export default function/)
  assert.match(chatLoading, /animate-pulse/)
  assert.match(mapLoading, /export default function/)
  assert.match(mapLoading, /loading-spinner/)
})

test('map replaces 30s polling with a realtime subscription', () => {
  const source = readProjectFile('app/page.tsx')

  // 30초 전체 폴링 제거
  assert.doesNotMatch(source, /setInterval\(loadMapRooms, 30000\)/)
  // 실시간 구독으로 대체
  assert.match(source, /\.channel\('map-rooms'\)/)
  assert.match(source, /table: 'chat_rooms'/)
})
