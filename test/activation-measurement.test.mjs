import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

const root = process.cwd()

function readProjectFile(path) {
  return readFileSync(join(root, path), 'utf8')
}

function transpileCommonJs(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText
}

function loadSupabaseExports() {
  const module = { exports: {} }
  const require = (specifier) => {
    if (specifier === '@supabase/ssr') {
      return { createBrowserClient: () => ({}) }
    }
    throw new Error(`Unexpected supabase import in test: ${specifier}`)
  }

  new Function('require', 'module', 'exports', transpileCommonJs(readProjectFile('lib/supabase.ts')))(
    require,
    module,
    module.exports,
  )
  return module.exports
}

function loadRoomInventoryExports() {
  const inventoryPath = join(root, 'lib/roomInventory.ts')
  assert.ok(existsSync(inventoryPath), 'lib/roomInventory.ts should define the shared inventory contract')

  const module = { exports: {} }
  const require = (specifier) => {
    if (specifier === '@/lib/supabase') return loadSupabaseExports()
    throw new Error(`Unexpected room inventory import in test: ${specifier}`)
  }

  new Function('require', 'module', 'exports', transpileCommonJs(readFileSync(inventoryPath, 'utf8')))(
    require,
    module,
    module.exports,
  )
  return module.exports
}

function room(overrides = {}) {
  return {
    id: 'room',
    from_location: '가천대역_1번출구',
    departure_date: '2026-09-04',
    departure_time: '20:00:00',
    max_participants: 4,
    participants: [],
    ...overrides,
  }
}

test('origin inventory separates visible rooms from rooms that can still be joined', () => {
  const { getOriginRoomInventory } = loadRoomInventoryExports()
  const now = new Date('2026-09-04T18:00:00+09:00')
  const rooms = [
    room({ id: 'past', departure_time: '17:00:00' }),
    room({
      id: 'full',
      departure_time: '19:00:00',
      max_participants: 2,
      participants: [{ id: '1' }, { id: '2' }],
    }),
    room({ id: 'joinable', participants: [{ id: '1' }] }),
    room({ id: 'other', from_location: '제2기숙사' }),
  ]

  assert.deepEqual(getOriginRoomInventory(rooms, '가천대역_1번출구', now), {
    visibleRoomCount: 3,
    joinableRoomCount: 1,
    hasJoinableRoom: true,
  })
})

test('origin inventory reports no actionable supply for an empty origin', () => {
  const { getOriginRoomInventory } = loadRoomInventoryExports()

  assert.deepEqual(getOriginRoomInventory([], '제2기숙사'), {
    visibleRoomCount: 0,
    joinableRoomCount: 0,
    hasJoinableRoom: false,
  })
})

test('fixed point selection records resolved actionable inventory', () => {
  const source = readProjectFile('components/HomeClient.tsx')

  assert.match(source, /getOriginRoomInventory\(mapRooms, location\)/)
  assert.match(source, /visible_room_count: inventory\.visibleRoomCount/)
  assert.match(source, /joinable_room_count: inventory\.joinableRoomCount/)
  assert.match(source, /has_joinable_room: inventory\.hasJoinableRoom/)
  assert.match(source, /inventory_state: isLoadingMapRooms \? 'loading' : 'ready'/)
})

test('map sheet records actionable empty state once per opening', () => {
  const source = readProjectFile('components/CampusRouteMap.tsx')

  assert.match(source, /const emptyStateOriginsRef = useRef\(new Set<LocationType>\(\)\)/)
  assert.match(source, /emptyStateOriginsRef\.current\.clear\(\)/)
  assert.match(source, /emptyStateOriginsRef\.current\.has\(selectedFrom\)/)
  assert.match(source, /emptyStateOriginsRef\.current\.add\(selectedFrom\)/)
  assert.match(source, /trackEvent\('room_empty_state_viewed'/)
  assert.match(source, /visible_room_count: selectedOriginInventory\.visibleRoomCount/)
  assert.match(source, /joinable_room_count: 0/)
  assert.match(source, /source: 'map_bottom_sheet'/)
})

test('create form records close and origin-change abandonment only before submit', () => {
  const source = readProjectFile('components/CampusRouteMap.tsx')

  assert.match(source, /const createAttemptRef = useRef</)
  assert.match(source, /reason: 'sheet_closed' \| 'origin_changed'/)
  assert.match(source, /trackEvent\('room_create_form_abandoned'/)
  assert.match(source, /has_destination: Boolean\(draftDestination\)/)
  assert.match(source, /has_departure_time: Boolean\(draftDepartureTime\)/)
  assert.match(source, /trackCreateFormAbandonment\('sheet_closed'\)/)
  assert.match(source, /trackCreateFormAbandonment\('origin_changed'\)/)
  assert.match(source, /if \(!attempt \|\| attempt\.submitted \|\| attempt\.abandoned\) return/)
  assert.match(source, /createAttemptRef\.current\.submitted = true/)
})
