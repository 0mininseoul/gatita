import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

function loadRouteAlerts() {
  const source = readFileSync(join(process.cwd(), 'lib/routeAlerts.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })

  const module = { exports: {} }
  // lib/routeAlerts.ts는 순수 함수만 두는 파일이라 원래 import가 없어야 한다.
  // 알 수 없는 import가 들어오면 즉시 throw해, 나중에 누군가 DB·네트워크
  // 의존성을 몰래 추가해도 이 테스트가 감지하도록 한다 (location-points.test.mjs:11-31 관례).
  const require = (specifier) => {
    throw new Error(`Unexpected import in test: ${specifier}`)
  }

  new Function('require', 'module', 'exports', outputText)(require, module, module.exports)
  return module.exports
}

test('일반 시간 구간은 경계를 포함한다', () => {
  const { isWithinNotifyWindow } = loadRouteAlerts()

  assert.equal(isWithinNotifyWindow('08:59:00', '09:00:00', '12:00:00'), false)
  assert.equal(isWithinNotifyWindow('09:00:00', '09:00:00', '12:00:00'), true)
  assert.equal(isWithinNotifyWindow('10:30:00', '09:00:00', '12:00:00'), true)
  assert.equal(isWithinNotifyWindow('12:00:00', '09:00:00', '12:00:00'), true)
  assert.equal(isWithinNotifyWindow('12:01:00', '09:00:00', '12:00:00'), false)
})

test('자정을 넘는 구간을 지원한다', () => {
  const { isWithinNotifyWindow } = loadRouteAlerts()

  // 22:00 ~ 02:00 — 심야 택시 시나리오
  assert.equal(isWithinNotifyWindow('22:00:00', '22:00:00', '02:00:00'), true)
  assert.equal(isWithinNotifyWindow('23:30:00', '22:00:00', '02:00:00'), true)
  assert.equal(isWithinNotifyWindow('00:30:00', '22:00:00', '02:00:00'), true)
  assert.equal(isWithinNotifyWindow('02:00:00', '22:00:00', '02:00:00'), true)
  assert.equal(isWithinNotifyWindow('03:00:00', '22:00:00', '02:00:00'), false)
  assert.equal(isWithinNotifyWindow('12:00:00', '22:00:00', '02:00:00'), false)
})

test('종일 구독은 모든 시각을 통과시킨다', () => {
  const { isWithinNotifyWindow } = loadRouteAlerts()

  assert.equal(isWithinNotifyWindow('03:00:00', null, null), true)
  assert.equal(isWithinNotifyWindow('14:00:00', null, null), true)
})

test('요일 판정은 KST 기준이다', () => {
  const { isNotifyWeekday } = loadRouteAlerts()

  // 2026-08-06 은 목요일(4)
  assert.equal(isNotifyWeekday('2026-08-06', [4]), true)
  assert.equal(isNotifyWeekday('2026-08-06', [1, 2, 3, 5]), false)
  // 평일 집합
  assert.equal(isNotifyWeekday('2026-08-06', [1, 2, 3, 4, 5]), true)
  // 2026-08-08 은 토요일(6)
  assert.equal(isNotifyWeekday('2026-08-08', [1, 2, 3, 4, 5]), false)
  assert.equal(isNotifyWeekday('2026-08-08', [0, 6]), true)
})

test('종일 구독은 새벽 02~06시에 발송을 보류한다', () => {
  const { isQuietHourForAllDay } = loadRouteAlerts()

  assert.equal(isQuietHourForAllDay(new Date('2026-08-06T01:59:00+09:00')), false)
  assert.equal(isQuietHourForAllDay(new Date('2026-08-06T02:00:00+09:00')), true)
  assert.equal(isQuietHourForAllDay(new Date('2026-08-06T05:59:00+09:00')), true)
  assert.equal(isQuietHourForAllDay(new Date('2026-08-06T06:00:00+09:00')), false)
  assert.equal(isQuietHourForAllDay(new Date('2026-08-06T23:00:00+09:00')), false)
})

test('shouldNotify 는 모든 조건을 결합한다', () => {
  const { shouldNotify } = loadRouteAlerts()

  const room = { departure_date: '2026-08-06', departure_time: '18:00:00' }  // 목요일
  const weekdayEvening = {
    notify_enabled: true,
    notify_from: '17:00:00',
    notify_to: '20:00:00',
    notify_weekdays: [1, 2, 3, 4, 5],
  }

  assert.equal(shouldNotify(room, weekdayEvening), true)

  // 알림 끔
  assert.equal(shouldNotify(room, { ...weekdayEvening, notify_enabled: false }), false)
  // 시간대 밖
  assert.equal(shouldNotify(room, { ...weekdayEvening, notify_from: '07:00:00', notify_to: '09:00:00' }), false)
  // 요일 밖
  assert.equal(shouldNotify(room, { ...weekdayEvening, notify_weekdays: [0, 6] }), false)
})

test('종일 구독은 새벽 방에 대해 심야 보류를 적용받는다', () => {
  const { shouldNotify } = loadRouteAlerts()

  const nightRoom = { departure_date: '2026-08-06', departure_time: '03:00:00' }
  const allDay = { notify_enabled: true, notify_from: null, notify_to: null, notify_weekdays: [0, 1, 2, 3, 4, 5, 6] }
  const explicit = { notify_enabled: true, notify_from: '02:00:00', notify_to: '05:00:00', notify_weekdays: [0, 1, 2, 3, 4, 5, 6] }

  const at3am = new Date('2026-08-06T03:00:00+09:00')

  // 종일 구독은 보류
  assert.equal(shouldNotify(nightRoom, allDay, at3am), false)
  // 명시적으로 새벽을 설정했다면 발송
  assert.equal(shouldNotify(nightRoom, explicit, at3am), true)
})
