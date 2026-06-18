import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

function loadSupabaseExports() {
  const source = readFileSync(join(process.cwd(), 'lib/supabase.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })

  const module = { exports: {} }
  const require = (specifier) => {
    if (specifier === '@supabase/ssr') {
      return { createBrowserClient: () => ({}) }
    }

    throw new Error(`Unexpected import in test: ${specifier}`)
  }

  new Function('require', 'module', 'exports', outputText)(require, module, module.exports)
  return module.exports
}

const {
  getDepartureTimeOptions,
  getDestinationOptions,
  GACHON_GLOBAL_CAMPUS_BOUNDS,
  isRestrictedRoutePair,
  LOCATION_ORDER,
  LOCATION_POINTS,
} = loadSupabaseExports()

function assertPointInRange(location, bounds) {
  const point = LOCATION_POINTS[location]

  assert.ok(point, `${location} point exists`)
  assert.ok(point.lat >= bounds.south && point.lat <= bounds.north, `${location} latitude ${point.lat} in range`)
  assert.ok(point.lng >= bounds.west && point.lng <= bounds.east, `${location} longitude ${point.lng} in range`)
}

test('campus map fixed points use the requested real-world anchors', () => {
  assert.ok(LOCATION_ORDER.includes('중앙도서관'), 'central library is a fixed point')
  assert.ok(!LOCATION_ORDER.includes('제3기숙사'), 'third dormitory is no longer a fixed point')

  assert.equal(LOCATION_POINTS['가천대역_1번출구'].shortLabel, '1번출구')
  assertPointInRange('가천대역_1번출구', {
    south: 37.4495,
    north: 37.44965,
    west: 127.12678,
    east: 127.12694,
  })

  assertPointInRange('가천대학교_정문', {
    south: 37.4502,
    north: 37.45042,
    west: 127.1276,
    east: 127.12784,
  })

  assertPointInRange('교육대학원', {
    south: 37.4518,
    north: 37.452,
    west: 127.13165,
    east: 127.13195,
  })

  assertPointInRange('제2기숙사', {
    south: 37.4558,
    north: 37.45625,
    west: 127.1342,
    east: 127.13485,
  })

  assertPointInRange('AI공학관', {
    south: 37.45505,
    north: 37.45525,
    west: 127.1333,
    east: 127.1337,
  })

  assertPointInRange('중앙도서관', {
    south: 37.45225,
    north: 37.45245,
    west: 127.13295,
    east: 127.1332,
  })
})

test('campus map bounds include the northern dormitory and AI building area', () => {
  assert.ok(
    GACHON_GLOBAL_CAMPUS_BOUNDS.north >= 37.4566,
    `north bound ${GACHON_GLOBAL_CAMPUS_BOUNDS.north} should include the upper campus`,
  )
})

test('route pairs that are too close are rejected in both directions', () => {
  assert.equal(typeof isRestrictedRoutePair, 'function')
  assert.equal(isRestrictedRoutePair('가천대역_1번출구', '가천대학교_정문'), true)
  assert.equal(isRestrictedRoutePair('가천대학교_정문', '가천대역_1번출구'), true)
  assert.equal(isRestrictedRoutePair('제2기숙사', 'AI공학관'), true)
  assert.equal(isRestrictedRoutePair('AI공학관', '제2기숙사'), true)
  assert.equal(isRestrictedRoutePair('중앙도서관', 'AI공학관'), false)
})

test('destination options exclude the selected origin and too-close routes', () => {
  const stationDestinations = getDestinationOptions('가천대역_1번출구')
  assert.ok(!stationDestinations.includes('가천대역_1번출구'))
  assert.ok(!stationDestinations.includes('가천대학교_정문'))
  assert.ok(stationDestinations.includes('중앙도서관'))

  const dormDestinations = getDestinationOptions('제2기숙사')
  assert.ok(!dormDestinations.includes('AI공학관'))
  assert.ok(dormDestinations.includes('교육대학원'))
})

test('departure time options start at the next interval and stay on the same day', () => {
  assert.deepEqual(
    getDepartureTimeOptions(new Date('2026-06-18T17:03:00+09:00'), 10),
    ['17:10', '17:20', '17:30', '17:40', '17:50', '18:00']
  )
  assert.deepEqual(
    getDepartureTimeOptions(new Date('2026-06-18T23:56:00+09:00'), 10),
    []
  )
})
