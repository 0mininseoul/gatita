import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

// I-지도 축소 마커 겹침: 캠퍼스가 1km 남짓이라 축소하면 고정지점 말풍선(이름)이
// 서로 겹쳐 읽을 수 없다는 실사용 피드백에 대한 수정. 임계값 판정을 lib/mapMarkerDisplay.ts
// 의 순수 함수로 뽑아, 여기서 실제로 호출해 경계값을 검증한다(lib/duplicateRoom.ts +
// test/duplicate-room.test.mjs 관례).

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function loadMapMarkerDisplay() {
  const source = readProjectFile('lib/mapMarkerDisplay.ts')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })

  const module = { exports: {} }
  // 순수 함수만 두는 파일이라 원래 import가 없어야 한다. 알 수 없는 import가
  // 들어오면 즉시 throw해 DB·네트워크 의존성이 몰래 섞이는 걸 감지한다.
  const require = (specifier) => {
    throw new Error(`Unexpected import in test: ${specifier}`)
  }

  new Function('require', 'module', 'exports', outputText)(require, module, module.exports)
  return module.exports
}

test('shouldShowMarkerNames: 레벨 1~4는 이름을 보여주고, 레벨 5~6(가장 축소·그 한 단계 안)은 숨긴다', () => {
  const { shouldShowMarkerNames, MAP_LABEL_HIDE_LEVEL } = loadMapMarkerDisplay()

  assert.equal(MAP_LABEL_HIDE_LEVEL, 5)

  assert.equal(shouldShowMarkerNames(1), true)
  assert.equal(shouldShowMarkerNames(2), true)
  assert.equal(shouldShowMarkerNames(3), true, '초기 레벨(3)에서는 이름이 보여야 한다')
  assert.equal(shouldShowMarkerNames(4), true, '레벨4(≈100m 축척)는 가장 가까운 두 지점(112m)도 아직 버티는 경계')

  // 사용자가 보고한 "가장 축소한 상태(레벨6)와 거기서 한 단계 확대한 상태(레벨5)"
  assert.equal(shouldShowMarkerNames(5), false)
  assert.equal(shouldShowMarkerNames(6), false)
})

test('shouldShowMarkerNames: 범위를 벗어난 레벨에서도 안전하게 동작한다', () => {
  const { shouldShowMarkerNames } = loadMapMarkerDisplay()

  assert.equal(shouldShowMarkerNames(0), true)
  assert.equal(shouldShowMarkerNames(14), false)
})

test('지도 컴포넌트가 zoom_changed 이벤트로 레벨을 추적하고, 순수 함수로 이름 표시 여부를 판단한다', () => {
  const source = readProjectFile('components/CampusRouteMap.tsx')

  assert.match(source, /import \{ shouldShowMarkerNames \} from '@\/lib\/mapMarkerDisplay'/)
  assert.match(source, /const \[mapLevel, setMapLevel\] = useState\(INITIAL_MAP_LEVEL\)/)
  assert.match(source, /kakao\.maps\.event\.addListener\(map, 'zoom_changed', handleZoomChanged\)/)
  assert.match(source, /setMapLevel\(map\.getLevel\(\)\)/)
  assert.match(source, /const showMarkerNames = shouldShowMarkerNames\(mapLevel\)/)
  // 이름 span은 확대 상태에서만 DOM에 추가된다.
  assert.match(source, /if \(showMarkerNames\) \{\s*const overlayLabel = document\.createElement\('span'\)/)
  // 개수 span(strong)은 축소·확대 상관없이 항상 추가된다("핀 + 방 개수"는 계속 보인다).
  assert.match(source, /const overlayCount = document\.createElement\('strong'\)/)
  assert.match(source, /showMarkerNames \? '' : 'is-compact'/)
  // 마커 렌더 effect가 축소↔확대 전환 시 다시 실행되도록 deps에 포함되어야 한다.
  assert.match(source, /\}, \[handleLocationSelect, mapStatus, originStats, selectedFrom, showMarkerNames\]\)/)
})

test('is-compact 클래스는 이름 span 없이도 뱃지가 좁게 보이도록 min/max-width를 푼다', () => {
  const cssSource = readProjectFile('app/globals.css')

  assert.match(cssSource, /\.gatita-map-overlay\.is-compact \{[^}]*min-width:\s*0;/)
  assert.match(cssSource, /\.gatita-map-overlay\.is-compact strong \{[^}]*min-width:\s*1\.5rem;/)
})

test('폴백(정적) 지도도 겹침을 줄이도록 한 줄 배지 + 우상단 카운트 배지 구조를 쓴다', () => {
  const source = readProjectFile('components/CampusRouteMap.tsx')
  const fallbackStart = source.indexOf("mapStatus === 'missing-key' || mapStatus === 'error'")
  const fallbackEnd = source.indexOf('{mapStatus === \'loading\'', fallbackStart)
  const fallbackBlock = source.slice(fallbackStart, fallbackEnd)

  assert.ok(fallbackStart > -1, '폴백 지도 블록을 찾을 수 없습니다')
  assert.ok(fallbackEnd > fallbackStart, '폴백 지도 블록 끝을 찾을 수 없습니다')

  // 예전의 2줄(이름 + "N개 방"/"참여중"/"출발") 레이아웃이 남아있으면 안 된다.
  assert.doesNotMatch(fallbackBlock, /개 방/)
  // 이름은 계속 보여야 한다 — 폴백 배경은 실제 지형이 아니라 장식용이라 이름이
  // 유일한 식별 수단이다.
  assert.match(fallbackBlock, /\{point\.shortLabel\}/)
  // 상태/인원 텍스트는 우상단 원형 배지로 옮겨졌다.
  assert.match(fallbackBlock, /const badgeText = hasMyOriginRoom \? '참여' : isOrigin \? '출발' : String\(originStat\.roomCount\)/)
  assert.match(fallbackBlock, /aria-label=\{hasMyOriginRoom \? `\$\{point\.label\} 참여 중인 방 출발지` : `\$\{point\.label\} 선택`\}/)
})
