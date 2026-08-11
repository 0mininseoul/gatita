import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

// lib/routeAlerts.ts(test/route-alert-conditions.test.mjs)와 동일한 관례: 이 파일은
// 순수 함수만 두어야 하므로 import가 없어야 한다. 알 수 없는 import가 생기면 즉시
// throw해 나중에 누군가 DB·네트워크 의존성을 몰래 추가해도 감지하도록 한다.
// 아래 테스트들은 소스 텍스트 패턴이 아니라 실제로 함수를 호출해 입력·출력을
// 검증한다 — 이 프로젝트의 다른 정규식 기반 라우트 테스트(test/route-subscription-api.test.mjs)가
// 놓친 런타임 버그(undefined vs null)를 잡기 위한 목적.
function loadRouteSubscriptionValidation() {
  const source = readFileSync(join(process.cwd(), 'lib/routeSubscriptionValidation.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })

  const module = { exports: {} }
  const require = (specifier) => {
    throw new Error(`Unexpected import in test: ${specifier}`)
  }

  new Function('require', 'module', 'exports', outputText)(require, module, module.exports)
  return module.exports
}

// ---- buildRouteUpdatePatch (PATCH /api/routes/[id]) ----
// 리뷰에서 지적된 Critical 버그의 회귀 가드: notify_from/notify_to 키가 아예 없는
// 부분 업데이트가 항상 400으로 잘못 거부되던 문제.

test('buildRouteUpdatePatch: notify_enabled만 있는 부분 업데이트는 통과한다 (알림 on/off 토글, 버그 회귀 가드)', () => {
  const { buildRouteUpdatePatch } = loadRouteSubscriptionValidation()

  const result = buildRouteUpdatePatch({ notify_enabled: false })
  assert.equal(result.ok, true)
  assert.deepEqual(result.patch, { notify_enabled: false })
})

test('buildRouteUpdatePatch: notify_weekdays만 있는 부분 업데이트는 통과한다', () => {
  const { buildRouteUpdatePatch } = loadRouteSubscriptionValidation()

  const result = buildRouteUpdatePatch({ notify_weekdays: [1, 2, 3] })
  assert.equal(result.ok, true)
  assert.deepEqual(result.patch, { notify_weekdays: [1, 2, 3] })
})

test('buildRouteUpdatePatch: notify_from/notify_to를 둘 다 null로 되돌리면(종일 복귀) 통과한다', () => {
  const { buildRouteUpdatePatch } = loadRouteSubscriptionValidation()

  const result = buildRouteUpdatePatch({ notify_from: null, notify_to: null })
  assert.equal(result.ok, true)
  assert.deepEqual(result.patch, { notify_from: null, notify_to: null })
})

test('buildRouteUpdatePatch: notify_from === notify_to (둘 다 non-null)는 거부한다', () => {
  const { buildRouteUpdatePatch } = loadRouteSubscriptionValidation()

  const result = buildRouteUpdatePatch({ notify_from: '09:00:00', notify_to: '09:00:00' })
  assert.equal(result.ok, false)
  assert.equal(result.error, '시작 시각과 종료 시각을 다르게 설정해주세요')
})

test('buildRouteUpdatePatch: 자정을 넘는 시간 구간(22:00~02:00, 심야 택시 시나리오)은 통과한다', () => {
  const { buildRouteUpdatePatch } = loadRouteSubscriptionValidation()

  const result = buildRouteUpdatePatch({ notify_from: '22:00:00', notify_to: '02:00:00' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.patch, { notify_from: '22:00:00', notify_to: '02:00:00' })
})

test('buildRouteUpdatePatch: notify_from만 있고 notify_to가 없으면(짝 없음) 거부한다', () => {
  const { buildRouteUpdatePatch } = loadRouteSubscriptionValidation()

  const result = buildRouteUpdatePatch({ notify_from: '09:00:00' })
  assert.equal(result.ok, false)
  assert.equal(result.error, '시작 시각과 종료 시각을 함께 설정해주세요')
})

test('buildRouteUpdatePatch: notify_to만 있고 notify_from이 없으면(짝 없음) 거부한다', () => {
  const { buildRouteUpdatePatch } = loadRouteSubscriptionValidation()

  const result = buildRouteUpdatePatch({ notify_to: '20:00:00' })
  assert.equal(result.ok, false)
  assert.equal(result.error, '시작 시각과 종료 시각을 함께 설정해주세요')
})

test('buildRouteUpdatePatch: 빈 body는 거부한다 (변경할 내용 없음)', () => {
  const { buildRouteUpdatePatch } = loadRouteSubscriptionValidation()

  const result = buildRouteUpdatePatch({})
  assert.equal(result.ok, false)
  assert.equal(result.error, '변경할 내용이 없습니다')
})

test('buildRouteUpdatePatch: notify_enabled가 boolean이 아니면 무시하고, 그 결과 다른 필드도 없으면 거부한다', () => {
  const { buildRouteUpdatePatch } = loadRouteSubscriptionValidation()

  const result = buildRouteUpdatePatch({ notify_enabled: 'yes' })
  assert.equal(result.ok, false)
  assert.equal(result.error, '변경할 내용이 없습니다')
})

test('buildRouteUpdatePatch: 여러 필드를 함께 보내면 모두 patch에 반영된다', () => {
  const { buildRouteUpdatePatch } = loadRouteSubscriptionValidation()

  const result = buildRouteUpdatePatch({
    notify_enabled: true,
    notify_from: '17:00:00',
    notify_to: '20:00:00',
    notify_weekdays: [1, 2, 3, 4, 5],
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.patch, {
    notify_enabled: true,
    notify_from: '17:00:00',
    notify_to: '20:00:00',
    notify_weekdays: [1, 2, 3, 4, 5],
  })
})

// ---- resolveNotifyTimeRange (POST/PATCH 공유) ----

test('resolveNotifyTimeRange: 두 키 모두 없으면 provided:false를 반환한다', () => {
  const { resolveNotifyTimeRange } = loadRouteSubscriptionValidation()

  assert.deepEqual(resolveNotifyTimeRange({}), { ok: true, provided: false })
})

test('resolveNotifyTimeRange: 일반 시간 구간은 통과하고 정규화된 값을 반환한다', () => {
  const { resolveNotifyTimeRange } = loadRouteSubscriptionValidation()

  const result = resolveNotifyTimeRange({ notify_from: '09:00:00', notify_to: '12:00:00' })
  assert.deepEqual(result, { ok: true, provided: true, notifyFrom: '09:00:00', notifyTo: '12:00:00' })
})

// ---- resolveNotifyWeekdays (POST/PATCH 공유) ----

test('resolveNotifyWeekdays: 빈 배열이나 배열이 아닌 값, 키 없음은 모두 제공되지 않은 것으로 취급한다', () => {
  const { resolveNotifyWeekdays } = loadRouteSubscriptionValidation()

  assert.deepEqual(resolveNotifyWeekdays({ notify_weekdays: [] }), { provided: false })
  assert.deepEqual(resolveNotifyWeekdays({ notify_weekdays: 'mon' }), { provided: false })
  assert.deepEqual(resolveNotifyWeekdays({}), { provided: false })
})

test('resolveNotifyWeekdays: 유효한 배열은 그대로 반환한다', () => {
  const { resolveNotifyWeekdays } = loadRouteSubscriptionValidation()

  assert.deepEqual(resolveNotifyWeekdays({ notify_weekdays: [0, 6] }), { provided: true, weekdays: [0, 6] })
})

// ---- validateRoutePair (POST 전용) ----

test('validateRoutePair: 유효하지 않은 위치는 거부한다', () => {
  const { validateRoutePair } = loadRouteSubscriptionValidation()

  const locations = ['A', 'B', 'C']
  const notRestricted = () => false

  assert.equal(validateRoutePair('A', 'Z', locations, notRestricted).ok, false)
  assert.equal(validateRoutePair(undefined, 'B', locations, notRestricted).ok, false)
})

test('validateRoutePair: 출발지=도착지 또는 제한된 경로는 거부하고, 그 외에는 통과한다', () => {
  const { validateRoutePair } = loadRouteSubscriptionValidation()

  const locations = ['A', 'B', 'C']
  assert.equal(validateRoutePair('A', 'A', locations, () => false).ok, false)
  assert.equal(validateRoutePair('A', 'B', locations, () => true).ok, false)

  const ok = validateRoutePair('A', 'B', locations, () => false)
  assert.deepEqual(ok, { ok: true, from: 'A', to: 'B' })
})

// ---- buildRouteCreateInput (POST /api/routes) ----

test('buildRouteCreateInput: 시간/요일을 생략하면 종일 + 매일 기본값으로 채워진다', () => {
  const { buildRouteCreateInput } = loadRouteSubscriptionValidation()

  const result = buildRouteCreateInput({ from_location: 'A', to_location: 'B' }, ['A', 'B'], () => false)
  assert.equal(result.ok, true)
  assert.deepEqual(result.input, {
    from: 'A',
    to: 'B',
    notifyFrom: null,
    notifyTo: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  })
})

test('buildRouteCreateInput: notify_from/notify_to가 같으면 거부한다', () => {
  const { buildRouteCreateInput } = loadRouteSubscriptionValidation()

  const result = buildRouteCreateInput(
    { from_location: 'A', to_location: 'B', notify_from: '09:00:00', notify_to: '09:00:00' },
    ['A', 'B'],
    () => false,
  )
  assert.equal(result.ok, false)
  assert.equal(result.error, '시작 시각과 종료 시각을 다르게 설정해주세요')
})

test('buildRouteCreateInput: 잘못된 경로면 시간/요일을 검사하지 않고 바로 거부한다', () => {
  const { buildRouteCreateInput } = loadRouteSubscriptionValidation()

  const result = buildRouteCreateInput(
    { from_location: 'A', to_location: 'A', notify_from: '09:00:00', notify_to: '09:00:00' },
    ['A', 'B'],
    () => false,
  )
  assert.equal(result.ok, false)
  assert.equal(result.error, '선택할 수 없는 경로입니다')
})
