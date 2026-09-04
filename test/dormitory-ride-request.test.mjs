import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
