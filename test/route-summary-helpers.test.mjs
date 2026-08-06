import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

// lib/routeAlerts.ts(test/route-alert-conditions.test.mjs) / lib/routeSubscriptionValidation.ts
// (test/route-subscription-validation.test.mjs)와 동일한 관례: lib/routeSummary.ts는
// 순수 함수만 두어야 하므로 import가 없어야 한다. 알 수 없는 import가 생기면 즉시
// throw해, 나중에 누군가 DB·네트워크 의존성을 몰래 추가해도 이 테스트가 감지하도록 한다.
function loadRouteSummary() {
  const source = readFileSync(join(process.cwd(), 'lib/routeSummary.ts'), 'utf8')
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

// ---- summarizeWeekdays ----

test('summarizeWeekdays: 7일 전부는 매일', () => {
  const { summarizeWeekdays } = loadRouteSummary()
  assert.equal(summarizeWeekdays([0, 1, 2, 3, 4, 5, 6]), '매일')
  // 순서가 뒤섞여도 집합만 같으면 동일하게 요약된다
  assert.equal(summarizeWeekdays([6, 5, 4, 3, 2, 1, 0]), '매일')
})

test('summarizeWeekdays: 월~금은 평일', () => {
  const { summarizeWeekdays } = loadRouteSummary()
  assert.equal(summarizeWeekdays([1, 2, 3, 4, 5]), '평일')
  assert.equal(summarizeWeekdays([5, 1, 3, 2, 4]), '평일')
})

test('summarizeWeekdays: 일·토는 주말', () => {
  const { summarizeWeekdays } = loadRouteSummary()
  assert.equal(summarizeWeekdays([0, 6]), '주말')
  assert.equal(summarizeWeekdays([6, 0]), '주말')
})

test('summarizeWeekdays: 프리셋과 안 맞으면 요일 이니셜을 · 로 이어붙인다', () => {
  const { summarizeWeekdays } = loadRouteSummary()
  assert.equal(summarizeWeekdays([1, 3, 5]), '월·수·금')
  assert.equal(summarizeWeekdays([4]), '목')
})

test('summarizeWeekdays: 빈 배열은 선택 안 함', () => {
  const { summarizeWeekdays } = loadRouteSummary()
  assert.equal(summarizeWeekdays([]), '선택 안 함')
})

// ---- summarizeWindow ----

test('summarizeWindow: from/to가 있으면 HH:MM~HH:MM', () => {
  const { summarizeWindow } = loadRouteSummary()
  assert.equal(summarizeWindow('17:00:00', '20:00:00'), '17:00~20:00')
})

test('summarizeWindow: from/to 중 하나라도 없으면 종일', () => {
  const { summarizeWindow } = loadRouteSummary()
  assert.equal(summarizeWindow(null, null), '종일')
  assert.equal(summarizeWindow('17:00:00', null), '종일')
  assert.equal(summarizeWindow(null, '20:00:00'), '종일')
})

// ---- weekdaysEqual ----

test('weekdaysEqual: 순서 무관하게 집합만 비교한다', () => {
  const { weekdaysEqual } = loadRouteSummary()
  assert.equal(weekdaysEqual([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]), true)
  assert.equal(weekdaysEqual([1, 2, 3, 4, 5], [1, 2, 3, 4]), false)
})

// ---- resolveNotifyWindowChange ----
// UI에서 notify_from === notify_to 조합을 애초에 고를 수 없게 막는 핵심 로직.
// Task 6 리뷰 발견 사항의 회귀 가드: 동일 시각은 자정 넘김 분기를 안 타고
// "그 1분만 통과"하는 죽은 구독이 된다.

test('resolveNotifyWindowChange: from을 바꿔도 to와 겹치지 않으면 그대로 반영', () => {
  const { resolveNotifyWindowChange } = loadRouteSummary()
  const next = resolveNotifyWindowChange('from', { from: '17:00', to: '20:00' }, '18:00')
  assert.deepEqual(next, { from: '18:00', to: '20:00' })
})

test('resolveNotifyWindowChange: to를 바꿔도 from과 겹치지 않으면 그대로 반영', () => {
  const { resolveNotifyWindowChange } = loadRouteSummary()
  const next = resolveNotifyWindowChange('to', { from: '17:00', to: '20:00' }, '21:00')
  assert.deepEqual(next, { from: '17:00', to: '21:00' })
})

test('resolveNotifyWindowChange: from을 to와 같은 값으로 바꾸면 to를 1분 밀어낸다', () => {
  const { resolveNotifyWindowChange } = loadRouteSummary()
  const next = resolveNotifyWindowChange('from', { from: '17:00', to: '20:00' }, '20:00')
  assert.deepEqual(next, { from: '20:00', to: '20:01' })
  assert.notEqual(next.from, next.to)
})

test('resolveNotifyWindowChange: to를 from과 같은 값으로 바꾸면 to를 1분 밀어낸다', () => {
  const { resolveNotifyWindowChange } = loadRouteSummary()
  const next = resolveNotifyWindowChange('to', { from: '17:00', to: '20:00' }, '17:00')
  assert.deepEqual(next, { from: '17:00', to: '17:01' })
  assert.notEqual(next.from, next.to)
})

test('resolveNotifyWindowChange: 자정 경계에서도 from !== to를 유지한다', () => {
  const { resolveNotifyWindowChange } = loadRouteSummary()
  // 23:59로 맞추면 00:00으로 감아 넘어간다
  const next = resolveNotifyWindowChange('from', { from: '22:00', to: '23:59' }, '23:59')
  assert.deepEqual(next, { from: '23:59', to: '00:00' })
  assert.notEqual(next.from, next.to)
})

test('resolveNotifyWindowChange: 연속으로 여러 번 바꿔도 항상 from !== to', () => {
  const { resolveNotifyWindowChange } = loadRouteSummary()
  let state = { from: '17:00', to: '20:00' }
  const moves = [
    ['from', '20:00'],
    ['to', '20:01'],
    ['from', '20:01'],
    ['to', '00:00'],
  ]
  for (const [field, value] of moves) {
    state = resolveNotifyWindowChange(field, state, value)
    assert.notEqual(state.from, state.to)
  }
})

// ---- toNotifyTimeSeconds ----

test('toNotifyTimeSeconds: HH:MM에 :00을 붙인다', () => {
  const { toNotifyTimeSeconds } = loadRouteSummary()
  assert.equal(toNotifyTimeSeconds('17:00'), '17:00:00')
  assert.equal(toNotifyTimeSeconds('00:00'), '00:00:00')
})
