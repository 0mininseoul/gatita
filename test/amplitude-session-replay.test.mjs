import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const clientSource = readFileSync(new URL('../lib/analytics/client.ts', import.meta.url), 'utf8')

test('Amplitude session replay plugin is installed and registered before init', () => {
  assert.ok(
    packageJson.dependencies?.['@amplitude/plugin-session-replay-browser'],
    '@amplitude/plugin-session-replay-browser must be installed as a dependency',
  )
  assert.match(clientSource, /from ['"]@amplitude\/plugin-session-replay-browser['"]/)
  assert.match(clientSource, /amplitude\.add\(\s*sessionReplayPlugin\(/)
  // 플러그인은 amplitude.init() 호출보다 먼저 등록해야 한다
  const addIndex = clientSource.indexOf('sessionReplayPlugin(')
  const initIndex = clientSource.indexOf('amplitude.init(')
  assert.ok(addIndex !== -1 && initIndex !== -1, 'both add() and init() must be present')
  assert.ok(addIndex < initIndex, 'sessionReplayPlugin must be added before amplitude.init()')
})

test('PII 보호: 모든 입력 필드를 마스킹한다', () => {
  assert.match(clientSource, /defaultMaskLevel:\s*['"]medium['"]/)
})

test('로그아웃 시 deviceId를 재생성하지 않는다 (세션 리플레이 deviceId 일관성)', () => {
  // amplitude.reset()은 deviceId를 새 UUID로 재생성해 세션 리플레이 데이터와
  // 분석 이벤트의 deviceId를 어긋나게 만든다. 사용자 식별만 해제해야 한다.
  assert.doesNotMatch(
    clientSource,
    /amplitude\.reset\(\)/,
    'amplitude.reset()은 deviceId를 재생성하므로 사용하면 안 된다',
  )
  assert.match(
    clientSource,
    /amplitude\.setUserId\(undefined\)/,
    '로그아웃 경로는 setUserId(undefined)로 사용자만 해제해야 한다',
  )
})
