import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

const root = process.cwd()

function readProjectFile(...parts) {
  return readFileSync(join(root, ...parts), 'utf8')
}

const migrationPath = [
  'supabase',
  'migrations',
  '20260904035539_add_dormitory_ride_requests.sql',
]

function transpileCommonJs(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText
}

function loadTypeScriptModule(path, imports = {}) {
  const module = { exports: {} }
  const require = (specifier) => {
    if (specifier in imports) return imports[specifier]
    if (specifier === '@supabase/ssr') return { createBrowserClient: () => ({}) }
    throw new Error(`Unexpected import in ${path}: ${specifier}`)
  }

  new Function('require', 'module', 'exports', transpileCommonJs(readProjectFile(path)))(
    require,
    module,
    module.exports,
  )
  return module.exports
}

function loadDormitoryExports() {
  const supabase = loadTypeScriptModule('lib/supabase.ts')
  const roomInventory = loadTypeScriptModule('lib/roomInventory.ts', {
    '@/lib/supabase': supabase,
  })

  return loadTypeScriptModule('lib/dormitoryRideRequest.ts', {
    '@/lib/supabase': supabase,
    '@/lib/roomInventory': roomInventory,
  })
}

function room(overrides = {}) {
  return {
    id: 'room',
    from_location: '가천대역_1번출구',
    to_location: '제2기숙사',
    departure_date: '2026-09-04',
    departure_time: '20:00:00',
    max_participants: 4,
    participants: [],
    ...overrides,
  }
}

test('schema stores private dormitory consent and a constrained room source', () => {
  const migration = readProjectFile(...migrationPath)
  const schema = readProjectFile('supabase_schema.sql')

  for (const source of [migration, schema]) {
    assert.match(source, /is_dormitory_resident\s+boolean/i)
    assert.match(source, /creation_source\s+text\s+not null\s+default 'standard'/i)
    assert.match(source, /creation_source in \('standard', 'dormitory_request'\)/i)
    assert.match(
      source,
      /from_location in \('가천대역_1번출구', '가천대학교_정문'\)[\s\S]*to_location = '제2기숙사'/i,
    )
    assert.match(
      source,
      /from_location = '제2기숙사'[\s\S]*to_location in \('가천대역_1번출구', '가천대학교_정문', '교육대학원', '중앙도서관', '학생회관'\)/i,
    )
  }
})

test('local Supabase types expose the private preference and room source', () => {
  const source = readProjectFile('lib', 'supabase.ts')

  assert.match(source, /is_dormitory_resident\?: boolean \| null/)
  assert.match(source, /creation_source: 'standard' \| 'dormitory_request'/)
})

test('station requests require empty joinable supply specifically to Dormitory 2', () => {
  const { getDormitoryRequestAvailability } = loadDormitoryExports()
  const now = new Date('2026-09-04T18:00:00+09:00')

  assert.deepEqual(getDormitoryRequestAvailability([], '가천대역_1번출구', now), {
    showBanner: true,
    destinationMode: 'fixed',
    fixedDestination: '제2기숙사',
  })
  assert.equal(getDormitoryRequestAvailability([
    room({ to_location: '중앙도서관' }),
  ], '가천대역_1번출구', now).showBanner, true)
  assert.equal(getDormitoryRequestAvailability([
    room({ to_location: '제2기숙사' }),
  ], '가천대역_1번출구', now).showBanner, false)
  assert.equal(getDormitoryRequestAvailability([
    room({ from_location: '가천대학교_정문' }),
  ], '가천대학교_정문', now).showBanner, false)
})

test('Dormitory 2 requests use origin-wide supply and every existing globally valid destination', () => {
  const {
    getDormitoryRequestAvailability,
    getDormitoryRequestDestinationOptions,
  } = loadDormitoryExports()
  const supabase = loadTypeScriptModule('lib/supabase.ts')
  const now = new Date('2026-09-04T18:00:00+09:00')

  assert.deepEqual(getDormitoryRequestAvailability([], '제2기숙사', now), {
    showBanner: true,
    destinationMode: 'selectable',
    fixedDestination: null,
  })
  assert.equal(getDormitoryRequestAvailability([
    room({ from_location: '제2기숙사', to_location: '중앙도서관' }),
  ], '제2기숙사', now).showBanner, false)
  assert.deepEqual(
    getDormitoryRequestDestinationOptions('제2기숙사'),
    supabase.getDestinationOptions('제2기숙사'),
  )
})

test('past and full rooms do not suppress a dormitory request banner', () => {
  const { getDormitoryRequestAvailability } = loadDormitoryExports()
  const now = new Date('2026-09-04T18:00:00+09:00')
  const rooms = [
    room({ from_location: '제2기숙사', departure_time: '17:00:00' }),
    room({
      id: 'full',
      from_location: '제2기숙사',
      to_location: '학생회관',
      max_participants: 2,
      participants: [{ id: 'one' }, { id: 'two' }],
    }),
  ]

  assert.equal(getDormitoryRequestAvailability(rooms, '제2기숙사', now).showBanner, true)
})

test('an open sheet refreshes availability as a room departure time passes', () => {
  const map = readProjectFile('components/CampusRouteMap.tsx')

  assert.match(map, /const \[inventoryRefreshNonce, setInventoryRefreshNonce\] = useState\(0\)/)
  assert.match(map, /if \(!selectedFrom\) return[\s\S]*setInventoryRefreshNonce\(\(nonce\) => nonce \+ 1\)/)
  assert.match(map, /void inventoryRefreshNonce/)
  assert.match(map, /getOriginRoomInventory\(rooms, selectedFrom, inventoryNow\)/)
  assert.match(map, /getDormitoryRequestAvailability\(rooms, selectedFrom, inventoryNow\)/)
})

test('unrelated origins never show the dormitory request banner', () => {
  const { getDormitoryRequestAvailability } = loadDormitoryExports()

  assert.equal(getDormitoryRequestAvailability([], '중앙도서관').showBanner, false)
})

test('recipient merge filters consent and global push, excludes creator, and deduplicates', () => {
  const { mergeDormitoryRequestRecipientIds } = loadDormitoryExports()

  assert.deepEqual(mergeDormitoryRequestRecipientIds(
    ['route-user', 'shared-user', 'creator'],
    [
      { user_id: 'resident', is_dormitory_resident: true, push_enabled: true },
      { user_id: 'shared-user', is_dormitory_resident: true, push_enabled: true },
      { user_id: 'creator', is_dormitory_resident: true, push_enabled: true },
      { user_id: 'push-off', is_dormitory_resident: true, push_enabled: false },
      { user_id: 'not-resident', is_dormitory_resident: false, push_enabled: true },
      { user_id: 'unanswered', is_dormitory_resident: null, push_enabled: true },
    ],
    'creator',
  ).sort(), ['resident', 'route-user', 'shared-user'])
})

test('profile completion keeps dormitory residency optional and persists every tri-state value', () => {
  const signup = readProjectFile('components/auth/SignupForm.tsx')
  const completeRoute = readProjectFile('app/api/profile/complete/route.ts')

  assert.match(completeRoute, /is_dormitory_resident\?: boolean \| null/)
  assert.match(completeRoute, /value === null \|\| typeof value === 'undefined'/)
  assert.match(completeRoute, /typeof value !== 'boolean'/)
  assert.match(completeRoute, /is_dormitory_resident: validated\.data\.isDormitoryResident/)
  assert.match(signup, /is_dormitory_resident: dormitoryResident/)
  assert.doesNotMatch(signup, /if \(isLastStep && dormitoryResident === null\)/)
})

test('onboarding uses the approved optional dormitory copy without requesting OS permission', () => {
  const signup = readProjectFile('components/auth/SignupForm.tsx')

  assert.match(signup, /기숙사생이신가요\?/)
  assert.match(signup, /같이타에 가입한 다른 기숙사생들과 동행 요청을 주고 받을 수 있어요/)
  assert.match(signup, /선택하지 않아도 가입할 수 있어요/)
  assert.match(signup, /dormitory_profile_answered/)
  assert.match(signup, /source: 'onboarding'/)
  assert.doesNotMatch(signup, /Notification\.requestPermission/)
})

test('the owner profile response includes dormitory residency without adding it to public profile fields', () => {
  const profileRoute = readProjectFile('app/api/profile/me/route.ts')
  const publicProfileType = readProjectFile('lib/supabase.ts')
    .match(/export type PublicProfile = \{[\s\S]*?\n\}/)?.[0] ?? ''

  assert.match(profileRoute, /\.select\('[^']*is_dormitory_resident[^']*'\)/)
  assert.match(profileRoute, /is_dormitory_resident: privateProfile\.is_dormitory_resident/)
  assert.doesNotMatch(publicProfileType, /is_dormitory_resident/)
})

test('settings update is authenticated, tri-state, owner-scoped, and analytics-backed', () => {
  const routePath = join(root, 'app/api/profile/dormitory/route.ts')
  assert.equal(existsSync(routePath), true, 'the authenticated dormitory settings route should exist')

  const settingsRoute = readFileSync(routePath, 'utf8')
  const settingsPage = readProjectFile('app/settings/page.tsx')

  assert.match(settingsRoute, /auth\.getUser\(\)/)
  assert.match(settingsRoute, /value === null \|\| typeof value === 'boolean'/)
  assert.match(settingsRoute, /is_dormitory_resident: payload\.is_dormitory_resident/)
  assert.match(settingsRoute, /\.eq\('user_id', authUser\.id\)/)
  assert.match(settingsPage, /fetch\('\/api\/profile\/dormitory'/)
  assert.match(settingsPage, /dormitory_profile_answered/)
  assert.match(settingsPage, /source: 'settings'/)
})

test('map renders the dormitory request banner only from shared availability rules', () => {
  const map = readProjectFile('components/CampusRouteMap.tsx')

  assert.match(map, /getDormitoryRequestAvailability/)
  assert.match(map, /dormitoryRequestAvailability\.showBanner/)
  assert.match(map, /혹시 기숙사 가시나요\?/)
  assert.match(map, /dormitory_request_banner_viewed/)
  assert.match(map, /dormitory_request_banner_clicked/)
  assert.match(map, /destination_mode: dormitoryRequestAvailability\.destinationMode/)
  assert.match(map, /joinable_room_count: 0/)
  assert.match(map, /dormitoryBannerOriginsRef\.current\.clear\(\)/)
})

test('request sheet uses approved copy, fixes station destinations, and keeps Dormitory 2 selectable', () => {
  const map = readProjectFile('components/CampusRouteMap.tsx')

  assert.match(map, /다른 기숙사생들에게 동행 요청을 보내드릴게요/)
  assert.doesNotMatch(map, /알림을 켠 기숙사생들에게 동행 요청을 알려드려요/)
  assert.match(map, /DORMITORY_REQUEST_DESTINATION/)
  assert.match(map, /getDormitoryRequestDestinationOptions\(selectedFrom\)/)
  assert.match(map, /dormitoryRequestAvailability\.destinationMode === 'selectable'/)
  assert.match(map, /'요청하기'/)
  assert.match(map, />취소<\/button>/)
})

test('request lifecycle records cancellation and submits a dormitory-sourced room', () => {
  const map = readProjectFile('components/CampusRouteMap.tsx')
  const home = readProjectFile('components/HomeClient.tsx')

  assert.match(map, /dormitory_request_cancelled/)
  assert.match(map, /has_destination: Boolean\(draftDestination\)/)
  assert.match(map, /has_departure_time: Boolean\(draftDepartureTime\)/)
  assert.match(map, /creationSource,/)
  assert.match(map, /setCreationSource\('dormitory_request'\)/)
  assert.match(home, /creationSource\?: 'standard' \| 'dormitory_request'/)
  assert.match(home, /creation_source: creationSource \?\? 'standard'/)
  assert.match(home, /creation_source: creationSource \?\? 'standard'/)
  assert.match(home, /dormitory_request_submitted/)
  assert.match(home, /dormitory_request_failed/)
  assert.match(home, /failure_stage/)
  assert.match(home, /reason_code/)
})

test('room creation is an authenticated atomic server operation', () => {
  const routePath = join(root, 'app/api/rooms/route.ts')
  assert.equal(existsSync(routePath), true, 'the authenticated room creation route should exist')

  const route = readFileSync(routePath, 'utf8')
  const home = readProjectFile('components/HomeClient.tsx')
  const legacyRooms = readProjectFile('app/rooms/page.tsx')
  const schema = readProjectFile('supabase_schema.sql')

  assert.match(route, /auth\.getUser\(\)/)
  assert.match(route, /\.rpc\('create_room_with_participant'/)
  assert.match(home, /fetch\('\/api\/rooms'/)
  assert.doesNotMatch(home, /\.from\('chat_rooms'\)[\s\S]{0,200}\.insert\(/)
  assert.doesNotMatch(home, /\.from\('room_participants'\)[\s\S]{0,200}\.insert\(/)
  assert.match(legacyRooms, /fetch\('\/api\/rooms'/)
  assert.doesNotMatch(legacyRooms, /\.from\('chat_rooms'\)[\s\S]{0,200}\.insert\(/)
  assert.doesNotMatch(legacyRooms, /\.from\('room_participants'\)[\s\S]{0,200}\.insert\(/)

  assert.match(schema, /create or replace function public\.create_room_with_participant/)
  assert.match(schema, /security definer/)
  assert.match(schema, /insert into public\.chat_rooms[\s\S]*insert into public\.room_participants/)
  assert.match(schema, /drop policy if exists "Authenticated active users can create chat rooms"/)
  assert.match(schema, /revoke insert, update, delete on table public\.chat_rooms from authenticated/)
  assert.match(schema, /drop policy if exists "Room creators can add themselves as participant"/)
  assert.match(schema, /revoke insert on table public\.room_participants from authenticated/)
})

test('the room creation transaction validates privileged dormitory requests', () => {
  const schema = readProjectFile('supabase_schema.sql')

  assert.match(schema, /private_profile\.onboarded_at is null/)
  assert.match(schema, /private_profile\.status <> 'active'/)
  assert.match(schema, /v_earliest_departure := date_trunc\('minute', v_now_kst\) \+ interval '1 minute'/)
  assert.match(schema, /departure_timestamp < v_earliest_departure/)
  assert.match(schema, /pg_advisory_xact_lock[\s\S]*dormitory-request-origin:[\s\S]*if p_creation_source = 'dormitory_request'/)
  assert.match(schema, /dormitory_request_supply_available/)
  assert.match(schema, /dormitory_request_rate_limited/)
  assert.match(schema, /dormitory_request_rate_limits/)
  assert.match(schema, /where chat_rooms\.status = 'active'/)
  assert.match(schema, /count\(room_participants\.id\)[\s\S]*< chat_rooms\.max_participants/)
})

test('new-room push waits for a valid creator participant in the transaction', () => {
  const schema = readProjectFile('supabase_schema.sql')

  assert.match(
    schema,
    /if not exists \([\s\S]*room_participants\.room_id = new\.id[\s\S]*room_participants\.user_id = new\.created_by[\s\S]*then[\s\S]*return new/,
  )
  assert.match(schema, /create constraint trigger notify_new_room_trigger/)
  assert.match(schema, /deferrable initially deferred/)
})

test('room creation rollout restores legacy standard writes before the final RPC-only cutover', () => {
  const bridge = readProjectFile(
    'supabase/migrations/20260904053000_restore_legacy_room_creation_during_rollout.sql',
  )
  const cutover = readProjectFile(
    'supabase/migrations/20260904055000_finalize_rpc_room_creation.sql',
  )

  assert.match(bridge, /grant insert, delete on table public\.chat_rooms to authenticated/)
  assert.match(bridge, /creation_source = 'standard'/)
  assert.match(bridge, /grant insert on table public\.room_participants to authenticated/)
  assert.match(readProjectFile('supabase_schema.sql'), /function public\.enforce_room_capacity\(\)[\s\S]*security definer/)
  assert.match(readProjectFile('supabase_schema.sql'), /create trigger lock_room_creation_origin_before_insert/)
  assert.match(readProjectFile('supabase_schema.sql'), /create trigger ensure_room_creator_participant_after_insert/)
  const schema = readProjectFile('supabase_schema.sql')
  assert.match(schema, /create trigger a_ignore_existing_creator_participant_before_insert/)
  assert.ok('a_ignore_existing_creator_participant_before_insert' < 'enforce_room_capacity_before_insert')
  assert.match(readProjectFile('supabase_schema.sql'), /values \(created_room\.id, v_user_id, true\)[\s\S]*on conflict \(room_id, user_id\) do nothing/)
  assert.match(cutover, /revoke insert, update, delete on table public\.chat_rooms from authenticated/)
  assert.match(cutover, /revoke insert on table public\.room_participants from authenticated/)
  assert.match(cutover, /create constraint trigger notify_new_room_trigger/)
  assert.match(cutover, /deferrable initially deferred/)
})

test('room creation 401 follows the existing expired-session recovery path', () => {
  const home = readProjectFile('components/HomeClient.tsx')
  const legacyRooms = readProjectFile('app/rooms/page.tsx')

  assert.match(home, /response\.status === 401[\s\S]*trackDormitoryRequestFailure\('authentication', 'session_expired'\)/)
  assert.match(home, /로그인이 만료되었습니다\. 다시 로그인해주세요/)
  assert.match(home, /router\.replace\('\/'\)/)
  assert.match(legacyRooms, /response\.status === 401[\s\S]*로그인이 만료되었습니다\. 다시 로그인해주세요/)
  assert.match(legacyRooms, /response\.status === 401[\s\S]*router\.replace\('\/'\)/)
})

test('failed room requests remain cancellable until creation succeeds', () => {
  const map = readProjectFile('components/CampusRouteMap.tsx')

  assert.match(map, /const succeeded = await onCreateRoom/)
  assert.match(map, /if \(!succeeded\) return/)
  assert.match(map, /if \(createAttemptRef\.current\)[\s\S]*submitted = true/)
  assert.match(map, /if \(dormitoryRequestAttemptRef\.current\)[\s\S]*submitted = true/)
})

test('room_created analytics identifies standard and dormitory request creation', () => {
  const home = readProjectFile('components/HomeClient.tsx')

  assert.match(home, /trackEvent\('room_created',[\s\S]*creation_source: creationSource \?\? 'standard'/)
})

test('privacy policy discloses optional dormitory preference use and user control', () => {
  const privacy = readProjectFile('app/privacy/page.tsx')

  assert.match(privacy, /선택 입력한 기숙사생 여부/)
  assert.match(privacy, /기숙사 동행 요청 알림 수신자 선정/)
  assert.match(privacy, /다른 이용자에게 공개되지\s*않/)
  assert.match(privacy, /설정 화면에서 언제든지 변경/)
})
