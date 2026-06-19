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
  getMapRoomDateRange,
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
  assert.ok(LOCATION_ORDER.includes('교육대학원'), 'graduate school remains a fixed point')
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

test('map room date range includes the next day for post-midnight departures', () => {
  assert.deepEqual(
    getMapRoomDateRange(new Date('2026-06-18T20:48:00+09:00')),
    ['2026-06-18', '2026-06-19'],
  )
})

test('campus map room times are displayed without seconds', () => {
  const source = readProjectFile('components/CampusRouteMap.tsx')

  assert.match(source, /function formatRoomTime/)
  assert.match(source, /formatRoomTime\(selectedOriginStat\.nextTime\)/)
  assert.match(source, /formatRoomTime\(room\.departure_time\)/)
  assert.doesNotMatch(source, /<span>\{room\.departure_time\}<\/span>/)
})

test('map bottom sheet room cards show destination only beside departure time', () => {
  const source = readProjectFile('components/CampusRouteMap.tsx')
  const roomCardStart = source.indexOf('selectedOriginRooms.map')
  const roomCardEnd = source.indexOf('})}', roomCardStart)
  const roomCardBlock = source.slice(roomCardStart, roomCardEnd)

  assert.ok(roomCardStart > -1, 'selected origin room list exists')
  assert.match(roomCardBlock, /formatRoomTime\(room\.departure_time\)/)
  assert.match(roomCardBlock, /\(\{LOCATIONS\[room\.to_location\]\}\)/)
  assert.doesNotMatch(roomCardBlock, /LOCATIONS\[room\.from_location\]/, 'origin should not be repeated inside origin sheet cards')
  assert.doesNotMatch(roomCardBlock, /ArrowRight/, 'compact room cards should not need route arrows')
  assert.match(roomCardBlock, /!\s*isPastDeparture &&/, 'past departure rooms should hide participant counts in the bottom sheet')
})

test('map room loading keeps only rooms within the visible map window', () => {
  const source = readProjectFile('app/page.tsx')
  const loadStart = source.indexOf('const loadMapRooms = useCallback')
  const loadEnd = source.indexOf('\n  const checkAuth', loadStart)
  const loadBlock = source.slice(loadStart, loadEnd)

  assert.ok(loadStart > -1, 'loadMapRooms exists')
  assert.ok(loadEnd > loadStart, 'loadMapRooms block can be inspected')
  assert.match(loadBlock, /getMapRoomDateRange\(new Date\(\)\)/)
  assert.match(loadBlock, /\.in\('departure_date', visibleDates\)/)
  assert.match(loadBlock, /\.eq\('status', 'active'\)/)
  assert.match(loadBlock, /isRoomVisibleOnMap/, 'map should hide rooms more than 30 minutes after departure')
  assert.doesNotMatch(loadBlock, /departure_time\s*>=/, 'same-day room loading should not use fragile string comparisons')
})

test('room join capacity trigger can lock active rooms without granting participant room edits', () => {
  const schema = readProjectFile('supabase_schema.sql')
  const migration = readProjectFile('supabase/migrations/20260619022643_allow_room_capacity_lock_for_join.sql')

  assert.match(schema, /Authenticated users can lock active rooms for capacity checks/)
  assert.match(schema, /using \(status = 'active'\)/)
  assert.match(schema, /with check \(false\)/)
  assert.match(migration, /for update\s+to authenticated/i)
  assert.match(migration, /with check \(false\)/i)
})

test('room joins go through a server route that verifies the session and uses the service role safely', () => {
  const mapSource = readProjectFile('app/page.tsx')
  const roomsSource = readProjectFile('app/rooms/page.tsx')
  const routeSource = readProjectFile('app/api/rooms/[id]/join/route.ts')

  assert.match(mapSource, /fetch\(`\/api\/rooms\/\$\{roomId\}\/join`,\s*\{\s*method:\s*'POST'/)
  assert.match(roomsSource, /fetch\(`\/api\/rooms\/\$\{roomId\}\/join`,\s*\{\s*method:\s*'POST'/)
  assert.match(routeSource, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(routeSource, /auth\.getUser\(\)/)
  assert.match(routeSource, /\.from\('users'\)[\s\S]*\.eq\('id', authUser\.id\)/)
  assert.match(routeSource, /profile\.status !== 'active'/)
  assert.match(routeSource, /isRoomJoinable\(room\.departure_date, room\.departure_time\)/)
  assert.match(routeSource, /currentParticipants\.length >= room\.max_participants/)
  assert.match(routeSource, /\.from\('room_participants'\)[\s\S]*\.insert\(/)
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

test('profileless authenticated users see the map first and complete profile from gated actions', () => {
  const source = readProjectFile('app/page.tsx')
  const signup = readProjectFile('components/auth/SignupForm.tsx')
  const noProfileStart = source.indexOf('} else {\n          setUser(null)\n          setAuthMode(null)')
  const noProfileEnd = source.indexOf('\n        }', noProfileStart)
  const noProfileBlock = source.slice(noProfileStart, noProfileEnd)

  assert.match(source, /const \[hasAuthenticatedSession, setHasAuthenticatedSession\]/)
  assert.match(source, /const \[pendingProfileName, setPendingProfileName\]/)
  assert.match(source, /extractGachonProfileFromMetadata/, 'map greeting should use Google profile metadata before local profile exists')
  assert.match(source, /setPendingProfileName\(getGoogleAccountName\(email, session\.user\.user_metadata\)\)/)
  assert.match(source, /const requiresProfile = hasAuthenticatedSession && !user/)
  assert.match(source, /const showLanding = !loading && authMode !== 'signup' && \(!hasAuthenticatedSession \|\| !hasEnteredApp\)/)
  assert.match(source, /if \(showLanding\) \{/)
  assert.doesNotMatch(source, /if \(!user \|\| !hasEnteredApp\) \{/)

  assert.ok(noProfileStart > -1, 'missing profile branch exists')
  assert.match(noProfileBlock, /await loadMapRooms\(\)/, 'missing profile branch should still load the map')
  assert.match(noProfileBlock, /enterMap\(false\)/, 'missing profile branch should route into map UI')
  assert.doesNotMatch(noProfileBlock, /setAuthMode\('signup'\)/, 'missing profile branch should not auto-open profile setup')

  assert.match(source, /router\.replace\('\/map'\)/, 'OAuth completion should normalize the URL to the map route')
  assert.match(source, /hasShownProfileRequiredPromptRef/, 'profile completion prompt should be shown once on initial map entry')
  assert.match(source, /프로필 세팅을 먼저 완료해주세요/)
  assert.match(source, /프로필 세팅 이후 &lt;같이타&gt;를 이용할 수 있어요\./)
  assert.doesNotMatch(source, /지도는 먼저 둘러볼 수 있어요/)
  assert.doesNotMatch(source, /계좌정보는 방장이 되었을 때 정산을 위해 멤버에게 보일 수 있어요/)
  assert.match(source, /aria-label="프로필 안내 닫기"/)
  assert.match(source, /onClick=\{openProfileSetup\}/)
  assert.match(source, /\{profileDisplayName\}님, 안녕하세요!/)
  assert.match(source, /handleFromLocationChange[\s\S]*requiresProfile[\s\S]*setShowProfileRequiredModal\(true\)/)
  assert.match(source, /const handleOpenMyRooms[\s\S]*requiresProfile[\s\S]*setShowProfileRequiredModal\(true\)/)
  assert.match(source, /aria-label="설정"[\s\S]*requiresProfile[\s\S]*setShowProfileRequiredModal\(true\)/)
  assert.match(signup, /if \(onBackToLanding\)[\s\S]*onBackToLanding\(\)[\s\S]*return[\s\S]*await supabase\.auth\.signOut\(\)/)
})

test('landing exposes email password login only through the test login query', () => {
  const source = readProjectFile('app/page.tsx')

  assert.match(source, /test-login/)
  assert.match(source, /showTestLogin/)
  assert.match(source, /signInWithPassword/)
  assert.match(source, /검수용 로그인/)
  assert.match(source, /테스트 계정으로 로그인/)
  assert.match(source, /isGachonEmail\(email\)/)
})

test('map shows a one-time PWA home screen onboarding modal', () => {
  const source = readProjectFile('app/page.tsx')
  const manifest = readProjectFile('public/manifest.json')
  const onboardingStart = source.indexOf('{showPwaOnboarding && (')
  const onboardingEnd = source.indexOf('\n      <header', onboardingStart)
  const onboardingBlock = source.slice(onboardingStart, onboardingEnd)

  assert.match(source, /showPwaOnboarding/)
  assert.match(source, /gatita:pwa-onboarding-dismissed/)
  assert.match(source, /gatita:pwa-installed-detected/)
  assert.match(source, /pwa_install_instruction_shown/)
  assert.match(source, /pwa_install_instruction_dismissed/)
  assert.match(source, /pwa_install_prompt_available/)
  assert.match(source, /pwa_installed_detected/)
  assert.match(source, /window\.addEventListener\('appinstalled'/)
  assert.match(source, /detection_source:\s*'standalone_open'/)
  assert.match(source, /홈 화면에 추가/)
  assert.match(source, /지금 할게요/)
  assert.match(source, /브라우저의 공유/)
  assert.match(source, /<Share2 className="mx-1 inline h-3\.5 w-3\.5/)
  assert.doesNotMatch(onboardingBlock, />PWA</)
  assert.doesNotMatch(onboardingBlock, /Safari/)
  assert.doesNotMatch(onboardingBlock, /설치 시도/)
  assert.doesNotMatch(onboardingBlock, /aria-label="PWA 안내 닫기"/)
  assert.doesNotMatch(source, /handlePwaInstallClick/)
  assert.match(source, /isInstalled\(\)/)
  assert.match(manifest, /"display":\s*"standalone"/)
  assert.match(manifest, /"start_url":\s*"\/map"/)
})

test('service worker refreshes navigations before falling back to cached app shell', () => {
  const source = readProjectFile('public/sw.js')

  assert.match(source, /gatita-v1\.0\.1/)
  assert.match(source, /event\.request\.mode === 'navigate'/)
  assert.match(source, /fetch\(event\.request\)/)
  assert.match(source, /cache\.put\(event\.request, responseToCache\)/)
  assert.doesNotMatch(source, /if \(response\) \{\s*return response\s*\}/)
})

test('iOS PWA startup images are generated and registered for current iPhones', () => {
  const layout = readProjectFile('app/layout.tsx')
  const pageSource = readProjectFile('app/page.tsx')
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
  assert.match(layout, /SPLASH_ASSET_VERSION/)
  assert.match(layout, /\?v=\$\{SPLASH_ASSET_VERSION\}/)
  assert.match(layout, /device-width: 440px/)
  assert.match(layout, /device-height: 956px/)
  assert.match(pageSource, /showStandaloneSplash/)
  assert.match(pageSource, /gatita-pwa-launch-splash/)
  assert.match(pageSource, /isInstalled\(\)/)
  assert.match(pageSource, /setShowStandaloneSplash\(false\)/)
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
