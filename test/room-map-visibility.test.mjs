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

  // test/location-points.test.mjs 의 로더와 동일한 패턴.
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

// 2026-08-06(목) 14:00 KST 기준
const NOW = new Date('2026-08-06T14:00:00+09:00')

test('당일 방은 출발 시각이 지나도 계속 노출된다', () => {
  const { isRoomVisibleOnMap } = loadSupabaseExports()

  // 4시간 지난 방 — 기존 30분 창이면 숨겨졌을 것
  assert.equal(isRoomVisibleOnMap('2026-08-06', '10:00:00', NOW), true)
  // 방금 지난 방
  assert.equal(isRoomVisibleOnMap('2026-08-06', '13:59:00', NOW), true)
  // 새벽 방
  assert.equal(isRoomVisibleOnMap('2026-08-06', '00:12:00', NOW), true)
})

test('당일 미래 방과 내일 방은 계속 노출된다', () => {
  const { isRoomVisibleOnMap } = loadSupabaseExports()

  assert.equal(isRoomVisibleOnMap('2026-08-06', '18:00:00', NOW), true)
  assert.equal(isRoomVisibleOnMap('2026-08-07', '09:00:00', NOW), true)
})

test('지난 날짜 방은 노출되지 않는다', () => {
  const { isRoomVisibleOnMap } = loadSupabaseExports()

  assert.equal(isRoomVisibleOnMap('2026-08-05', '23:59:00', NOW), false)
})

test('입장 가능 여부는 출발 시각 기준을 유지한다', () => {
  const { isRoomJoinable } = loadSupabaseExports()

  // 노출은 되지만 입장은 불가
  assert.equal(isRoomJoinable('2026-08-06', '10:00:00', NOW), false)
  assert.equal(isRoomJoinable('2026-08-06', '18:00:00', NOW), true)
})

test('30분 노출 창 상수는 제거되었다', () => {
  const exports = loadSupabaseExports()
  assert.equal(exports.ROOM_MAP_VISIBILITY_WINDOW_MINUTES, undefined)
})
