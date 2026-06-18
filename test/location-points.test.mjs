import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

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
  getDepartureDateForTime,
  getDepartureTimeOptions,
  getDestinationOptions,
  GACHON_GLOBAL_CAMPUS_BOUNDS,
  isRoomJoinable,
  isRoomVisibleOnMap,
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
  assert.equal(isRestrictedRoutePair('교육대학원', '중앙도서관'), true)
  assert.equal(isRestrictedRoutePair('중앙도서관', '교육대학원'), true)
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

  const graduateSchoolDestinations = getDestinationOptions('교육대학원')
  assert.ok(!graduateSchoolDestinations.includes('중앙도서관'))
})

test('departure time options use five minute intervals through 01:00', () => {
  assert.deepEqual(
    getDepartureTimeOptions(new Date('2026-06-18T20:48:00+09:00')),
    [
      '20:50', '20:55', '21:00', '21:05', '21:10', '21:15', '21:20', '21:25', '21:30', '21:35',
      '21:40', '21:45', '21:50', '21:55', '22:00', '22:05', '22:10', '22:15', '22:20', '22:25',
      '22:30', '22:35', '22:40', '22:45', '22:50', '22:55', '23:00', '23:05', '23:10', '23:15',
      '23:20', '23:25', '23:30', '23:35', '23:40', '23:45', '23:50', '23:55', '00:00', '00:05',
      '00:10', '00:15', '00:20', '00:25', '00:30', '00:35', '00:40', '00:45', '00:50', '00:55',
      '01:00',
    ]
  )
  assert.deepEqual(
    getDepartureTimeOptions(new Date('2026-06-18T23:56:00+09:00'), 10),
    ['00:00', '00:10', '00:20', '00:30', '00:40', '00:50', '01:00']
  )
})

test('legacy rooms create modal also uses future departure time options', () => {
  const source = readProjectFile('app/rooms/page.tsx')

  assert.match(source, /getDepartureTimeOptions\(new Date\(\), 5\)/)
  assert.doesNotMatch(source, /type="time"/)
})

test('departure date follows the selected post-midnight time', () => {
  const now = new Date('2026-06-18T20:48:00+09:00')
  assert.equal(getDepartureDateForTime(now, '21:00'), '2026-06-18')
  assert.equal(getDepartureDateForTime(now, '00:30'), '2026-06-19')
})

test('campus map room times are displayed without seconds', () => {
  const source = readProjectFile('components/CampusRouteMap.tsx')

  assert.match(source, /function formatRoomTime/)
  assert.match(source, /formatRoomTime\(selectedOriginStat\.nextTime\)/)
  assert.match(source, /formatRoomTime\(room\.departure_time\)/)
  assert.doesNotMatch(source, /<span>\{room\.departure_time\}<\/span>/)
})

test('map room loading keeps only rooms within the visible map window', () => {
  const source = readProjectFile('app/page.tsx')
  const loadStart = source.indexOf('const loadMapRooms = useCallback')
  const loadEnd = source.indexOf('\n  const checkAuth', loadStart)
  const loadBlock = source.slice(loadStart, loadEnd)

  assert.ok(loadStart > -1, 'loadMapRooms exists')
  assert.ok(loadEnd > loadStart, 'loadMapRooms block can be inspected')
  assert.match(loadBlock, /\.eq\('departure_date', today\)/)
  assert.match(loadBlock, /\.eq\('status', 'active'\)/)
  assert.match(loadBlock, /isRoomVisibleOnMap/, 'map should hide rooms more than 30 minutes after departure')
  assert.doesNotMatch(loadBlock, /departure_time\s*>=/, 'same-day room loading should not use fragile string comparisons')
})

test('room visibility and joinability follow departure time rules', () => {
  assert.equal(isRoomJoinable('2026-06-19', '12:00', new Date('2026-06-19T11:59:00+09:00')), true)
  assert.equal(isRoomJoinable('2026-06-19', '12:00', new Date('2026-06-19T12:00:00+09:00')), true)
  assert.equal(isRoomJoinable('2026-06-19', '12:00', new Date('2026-06-19T12:01:00+09:00')), false)
  assert.equal(isRoomVisibleOnMap('2026-06-19', '12:00', new Date('2026-06-19T12:29:00+09:00')), true)
  assert.equal(isRoomVisibleOnMap('2026-06-19', '12:00', new Date('2026-06-19T12:31:00+09:00')), false)
})

test('map header exposes my rooms list from the user membership query', () => {
  const source = readProjectFile('app/page.tsx')

  assert.match(source, /showMyRooms/, 'home map should track my rooms sheet state')
  assert.match(source, /loadMyRooms/, 'home map should load my rooms on demand')
  assert.match(source, /나의 방/, 'home map header should expose a my rooms action')
  assert.match(source, /\.from\('room_participants'\)[\s\S]*\.eq\('user_id', user\.id\)/, 'my rooms should be based on memberships')
  assert.match(source, /router\.push\(`\/rooms\/\$\{room\.id\}`\)/, 'my rooms list should navigate to the room')
})

test('landing and authenticated map use separate URL paths', () => {
  const homeSource = readProjectFile('app/page.tsx')
  const mapRouteSource = readProjectFile('app/map/page.tsx')
  const settingsSource = readProjectFile('app/settings/page.tsx')
  const chatSource = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(mapRouteSource, /export \{ default \} from '\.\.\/page'/)
  assert.match(homeSource, /window\.location\.pathname === '\/map'/)
  assert.match(homeSource, /router\.push\('\/map'\)/)
  assert.match(settingsSource, /router\.push\('\/map'\)/)
  assert.match(chatSource, /router\.push\('\/map'\)/)
})

test('map shows a one-time PWA home screen onboarding modal', () => {
  const source = readProjectFile('app/page.tsx')
  const manifest = readProjectFile('public/manifest.json')

  assert.match(source, /showPwaOnboarding/)
  assert.match(source, /gatita:pwa-onboarding-dismissed/)
  assert.match(source, /홈 화면에 추가/)
  assert.match(source, /PWAInstallManager/)
  assert.match(source, /isInstalled\(\)/)
  assert.match(manifest, /"display":\s*"standalone"/)
  assert.match(manifest, /"start_url":\s*"\/map"/)
})

test('iOS PWA startup images are generated and registered for current iPhones', () => {
  const layout = readProjectFile('app/layout.tsx')
  const splashScript = readProjectFile('scripts/generate-ios-splash.mjs')
  const expectedImages = [
    'iphone-17-pro-max.png',
    'iphone-17-air.png',
    'iphone-17-pro.png',
    'iphone-16-pro-max.png',
    'iphone-16-pro.png',
    'iphone-15-pro-max.png',
    'iphone-14.png',
    'iphone-se.png',
  ]

  assert.match(layout, /startupImage/)
  assert.match(layout, /apple-touch-startup-image/)
  assert.match(layout, /device-width: 440px/)
  assert.match(layout, /device-height: 956px/)
  assert.match(splashScript, /Google Chrome\.app/)
  assert.match(splashScript, /Paperlogy-9Black\.woff2/)
  assert.match(splashScript, /pageHtml/)
  assert.match(splashScript, /--screenshot=/)
  assert.doesNotMatch(splashScript, /<text/)
  assert.doesNotMatch(splashScript, /sips/)

  expectedImages.forEach((imageName) => {
    assert.equal(
      existsSync(join(process.cwd(), 'public', 'splash', imageName)),
      true,
      `${imageName} should exist`,
    )
  })
})
