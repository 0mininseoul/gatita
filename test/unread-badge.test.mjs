import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = process.cwd()
const readProjectFile = (...parts) => readFileSync(join(root, ...parts), 'utf8')

test('map shows an unread message badge backed by per-room read tracking', () => {
  const page = readProjectFile('app', 'page.tsx')
  const readRoute = readProjectFile('app', 'api', 'rooms', '[id]', 'read', 'route.ts')
  const chat = readProjectFile('app', 'rooms', '[id]', 'page.tsx')
  const schema = readProjectFile('supabase_schema.sql')
  const migrations = readdirSync(join(root, 'supabase', 'migrations'))
    .filter((filename) => filename.endsWith('.sql'))
    .map((filename) => readProjectFile('supabase', 'migrations', filename))
    .join('\n')

  // Map badge reads the count from the security-definer RPC and renders it on 나의 방.
  assert.match(page, /supabase\.rpc\('get_my_unread_count'\)/, 'map should fetch unread count via RPC')
  assert.match(page, /setUnreadCount/, 'map should track unread count state')
  assert.match(page, /unreadCount > 0 &&/, 'badge should only render when there are unread messages')
  assert.match(page, /unreadCount > 99 \? '99\+'/, 'badge should cap the displayed count')
  assert.match(page, /table: 'messages' \}, scheduleUnreadReload/, 'new messages should refresh the badge live')
  assert.match(page, /안 읽은 메시지/, 'badge should expose an accessible unread label')

  // My rooms sheet shows which joined room has unread messages.
  assert.match(schema, /function public\.get_my_unread_room_counts\(\)/, 'schema should define per-room unread counts')
  assert.match(migrations, /function public\.get_my_unread_room_counts\(\)/, 'migration should add the per-room unread count function')
  assert.match(page, /supabase\.rpc\('get_my_unread_room_counts'\)/, 'my rooms should load per-room unread counts via RPC')
  assert.match(page, /unread_count/, 'my room summaries should carry per-room unread counts')
  assert.match(page, /room\.unread_count > 0 &&/, 'my rooms should only render room badges when unread messages exist')
  assert.match(page, /room\.unread_count > 99 \? '99\+' : room\.unread_count/, 'room badges should cap the displayed count')
  assert.match(page, /안 읽은 메시지 \$\{room\.unread_count > 99 \? '99\+' : room\.unread_count\}개/, 'room badge should expose an accessible unread label')

  // Read tracking: server route stamps last_read_at; chat marks read on open and on leave.
  assert.match(readRoute, /last_read_at: new Date\(\)\.toISOString\(\)/, 'read route should stamp last_read_at')
  assert.match(chat, /\/api\/rooms\/\$\{roomId\}\/read/, 'chat should mark the room read through the server route')
  assert.match(chat, /useEffect\(\(\) => \(\) => markRoomRead\(\), \[markRoomRead\]\)/, 'chat should mark read on unmount')

  // Schema models read tracking + the aggregate function.
  assert.match(schema, /last_read_at timestamp with time zone/, 'room_participants should store last_read_at')
  assert.match(schema, /function public\.get_my_unread_count\(\)/, 'schema should define the unread count function')
})
