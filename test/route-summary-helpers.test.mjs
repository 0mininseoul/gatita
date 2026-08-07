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

// ---- isValidNotifyWindow ----
// UI가 notify_from === notify_to 조합에서 저장을 막을 때 쓰는 판정. 리뷰에서
// 지적된 "값을 몰래 밀어내는" 초안(resolveNotifyWindowChange)을 걷어내고, 출발지/도착지
// 충돌과 같은 패턴(인라인 에러 + 저장 버튼 비활성화)으로 통일하면서 그 판정만 순수 함수로 남긴다.

test('isValidNotifyWindow: 시작과 종료가 다르면 유효하다', () => {
  const { isValidNotifyWindow } = loadRouteSummary()
  assert.equal(isValidNotifyWindow('17:00', '20:00'), true)
  // 자정을 넘는 구간(22:00~02:00)도 값 자체가 다르므로 유효하다
  assert.equal(isValidNotifyWindow('22:00', '02:00'), true)
})

test('isValidNotifyWindow: 시작과 종료가 같으면 무효하다', () => {
  const { isValidNotifyWindow } = loadRouteSummary()
  assert.equal(isValidNotifyWindow('17:00', '17:00'), false)
  assert.equal(isValidNotifyWindow('00:00', '00:00'), false)
})

// ---- toNotifyTimeSeconds ----

test('toNotifyTimeSeconds: HH:MM에 :00을 붙인다', () => {
  const { toNotifyTimeSeconds } = loadRouteSummary()
  assert.equal(toNotifyTimeSeconds('17:00'), '17:00:00')
  assert.equal(toNotifyTimeSeconds('00:00'), '00:00:00')
})

// ---- ROUTES_SEEN_STORAGE_KEY ----
// I-4: app/routes/page.tsx(쓰기)와 components/HomeClient.tsx(읽기)가 이 키를 각자
// 리터럴로 선언했었다 — 한쪽 오타가 "새로 열린 방" 배지 계약을 조용히 깨뜨릴 수 있으므로,
// 값 자체와 양쪽 모두 공유 상수를 import하는지(로컬 재선언이 없는지)를 단언한다.

test('ROUTES_SEEN_STORAGE_KEY: 값은 gatita:routes:seen_at', () => {
  const { ROUTES_SEEN_STORAGE_KEY } = loadRouteSummary()
  assert.equal(ROUTES_SEEN_STORAGE_KEY, 'gatita:routes:seen_at')
})

test('ROUTES_SEEN_STORAGE_KEY: HomeClient와 /routes 페이지 둘 다 lib/routeSummary에서 import하고, 로컬 리터럴을 다시 선언하지 않는다', () => {
  const homeClientSource = readFileSync(join(process.cwd(), 'components/HomeClient.tsx'), 'utf8')
  const routesPageSource = readFileSync(join(process.cwd(), 'app/routes/page.tsx'), 'utf8')

  assert.match(homeClientSource, /import \{ ROUTES_SEEN_STORAGE_KEY \} from '@\/lib\/routeSummary'/)
  assert.match(routesPageSource, /import \{[\s\S]*?ROUTES_SEEN_STORAGE_KEY[\s\S]*?\} from '@\/lib\/routeSummary'/)

  // 로컬 재선언이 남아있으면 계약이 다시 갈라질 수 있다.
  assert.doesNotMatch(homeClientSource, /const ROUTES_SEEN_STORAGE_KEY = /)
  assert.doesNotMatch(routesPageSource, /const ROUTES_SEEN_STORAGE_KEY = /)
})
