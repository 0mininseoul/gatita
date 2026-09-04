import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

// I-7: route_subscribed의 이름·payload를 검증하는 테스트가 base에도 head에도 없었다
// (최종 리뷰). "이벤트 이름/필수 키" 류 실수가 이 기능에서만 Critical로 두 번
// 잡혔다(C-1의 favorites grant, I-3의 closed_alone 문서 드리프트) — 계약을 코드가
// 아니라 소스 텍스트로 직접 단언해, 다음 사람이 payload 키를 빠뜨리거나 이벤트
// 이름을 오타 내도 npm test가 잡도록 한다. 이 프로젝트의 기존 규약
// (test/profile-setup-analytics.test.mjs 등)과 같은 소스 그렙 방식을 따른다 — React
// 렌더링 하네스(@testing-library 등)가 이 저장소에 없으므로 실제 trackEvent 호출을
// 모킹하는 대신 정적으로 검사한다.

const root = process.cwd()
const readProjectFile = (...parts) => readFileSync(join(root, ...parts), 'utf8')

// design doc(docs/superpowers/specs/2026-08-06-route-subscription-alerts-design.md:581)의
// canonical 계약. 이 배열이 바로 그 정의의 소스코드 쪽 거울이다 — 둘 중 하나만 바뀌면
// 이 테스트가 실패해야 한다.
const ROUTE_SUBSCRIBED_PAYLOAD_KEYS = [
  'from_location',
  'to_location',
  'source',
  'has_time_window',
  'weekday_count',
]

// route_subscribed를 실제로 발화하는 두 지점. 새 유입 지점이 생기면 여기 추가한다.
const ROUTE_SUBSCRIBED_CALL_SITES = [
  ['app', 'routes', 'page.tsx'],
  ['components', 'HomeClient.tsx'],
]

// 같은 경로·같은 출발일시 중복 방 생성을 막는 두 지점. 둘 다 findDuplicateActiveRoom(클라
// 사전 검사)과 서버가 DB 23505를 변환한 duplicate_active_room 코드 처리를 함께
// 가져야 경쟁 조건에서도 안내가 끊기지 않는다.
const ROOM_CREATION_CALL_SITES = [
  ['components', 'HomeClient.tsx'],
  ['app', 'rooms', 'page.tsx'],
]

test('route_subscribed 이벤트가 두 유입 지점 모두에서 canonical 이름으로 발화한다', () => {
  for (const parts of ROUTE_SUBSCRIBED_CALL_SITES) {
    const source = readProjectFile(...parts)
    assert.match(
      source,
      /trackEvent\('route_subscribed',/,
      `${parts.join('/')}가 'route_subscribed'를 정확한 이름으로 발화해야 한다`,
    )
  }
})

test('route_subscribed 필수 payload 키가 두 지점 모두에 있다 (design doc 581행 canonical 계약)', () => {
  for (const parts of ROUTE_SUBSCRIBED_CALL_SITES) {
    const source = readProjectFile(...parts)
    const callIndex = source.indexOf("trackEvent('route_subscribed',")
    assert.notEqual(callIndex, -1, `${parts.join('/')}에 route_subscribed 호출이 있어야 한다`)

    // 호출부터 바로 다음 '})'까지만 잘라 그 호출의 payload만 검사한다 — 같은 파일의
    // 다른 trackEvent 호출(예: route_unsubscribed)과 섞이지 않게 하기 위함이다.
    const closingIndex = source.indexOf('})', callIndex)
    assert.notEqual(closingIndex, -1, `${parts.join('/')}의 route_subscribed 호출이 닫히지 않았다`)
    const callBlock = source.slice(callIndex, closingIndex)

    for (const key of ROUTE_SUBSCRIBED_PAYLOAD_KEYS) {
      assert.match(
        callBlock,
        new RegExp(`\\b${key}:`),
        `${parts.join('/')}의 route_subscribed payload에 '${key}'가 있어야 한다`,
      )
    }
  }
})

test('두 방 생성 경로 모두 클라이언트 사전 검사와 서버 중복 코드 처리를 함께 갖는다', () => {
  for (const parts of ROOM_CREATION_CALL_SITES) {
    const source = readProjectFile(...parts)

    assert.match(
      source,
      /findDuplicateActiveRoom\(/,
      `${parts.join('/')}가 insert 전에 클라이언트 사전 중복 검사를 해야 한다`,
    )
    assert.match(
      source,
      /result\?\.code === 'duplicate_active_room'/,
      `${parts.join('/')}가 DB 유니크 인덱스 위반을 서버가 변환한 코드로 별도 처리해야 한다`,
    )
  }
})

// app, components, lib, scripts 아래 소스 파일만 재귀 탐색한다(node_modules, .next, 숨김
// 디렉터리는 제외). docs/는 일부러 뺀다 — closed_alone은 "제거된 기능의 이력"으로
// 문서에는 의도적으로 남아 있다(I-3, 설계 문서 참고). 여기서 잡아야 하는 건 코드 재등장이다.
function collectSourceFiles(dir, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, results)
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      results.push(fullPath)
    }
  }
  return results
}

test('closed_alone / closedAlone은 코드에 재등장하지 않는다 (2026-08-11 제거, 회귀 방지)', () => {
  const codeRoots = ['app', 'components', 'lib', 'scripts']
  const files = codeRoots.flatMap((dirName) => collectSourceFiles(join(root, dirName)))

  assert.ok(files.length > 0, '검사 대상 소스 파일을 찾아야 한다')

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(
      source,
      /closed_alone|closedAlone/i,
      `${file}에 제거된 closed_alone 관련 코드가 다시 들어오면 안 된다 (성가심 피드백으로 제거됨, 대체 지점: repeat_route_prompt)`,
    )
  }
})
