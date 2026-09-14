import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

// test/room-map-visibility.test.mjs 의 로더와 동일한 패턴.
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

function readMigration() {
  return readFileSync(
    join(process.cwd(), 'supabase/migrations/20260914060000_room_departure_change_and_chat_system_messages.sql'),
    'utf8',
  )
}

function readDepartureRoute() {
  return readFileSync(join(process.cwd(), 'app/api/rooms/[id]/departure/route.ts'), 'utf8')
}

test('옮긴 폭은 미룸이 양수, 앞당김이 음수이고 자정을 넘겨도 이어진다', () => {
  const { getDepartureShiftMinutes } = loadSupabaseExports()

  assert.equal(getDepartureShiftMinutes('2026-09-14', '19:30:00', '2026-09-14', '19:45:00'), 15)
  assert.equal(getDepartureShiftMinutes('2026-09-14', '19:30', '2026-09-14', '19:20'), -10)
  assert.equal(getDepartureShiftMinutes('2026-09-14', '23:50', '2026-09-15', '00:10'), 20)
  assert.equal(getDepartureShiftMinutes('2026-09-15', '00:10', '2026-09-14', '23:50'), -20)
})

test('확정 해제는 앞당김이거나 10분을 넘겨 미룰 때만 일어난다', () => {
  const { shouldResetConfirmationsForShift, CONFIRMATION_RESET_THRESHOLD_MINUTES } = loadSupabaseExports()

  assert.equal(CONFIRMATION_RESET_THRESHOLD_MINUTES, 10)
  // 가장 잦은 소폭 지연은 방을 흔들지 않는다.
  assert.equal(shouldResetConfirmationsForShift(1), false)
  assert.equal(shouldResetConfirmationsForShift(10), false)
  assert.equal(shouldResetConfirmationsForShift(11), true)
  // 앞당김은 폭과 무관하게 참여자가 못 맞출 수 있다.
  assert.equal(shouldResetConfirmationsForShift(-1), true)
  assert.equal(shouldResetConfirmationsForShift(-30), true)
})

test('쿨다운 잔여 시간은 30초 창 안에서만 남는다', () => {
  const { getDepartureChangeCooldownRemainingMs, DEPARTURE_CHANGE_COOLDOWN_MS } = loadSupabaseExports()
  const now = new Date('2026-09-14T19:00:30+09:00')

  assert.equal(DEPARTURE_CHANGE_COOLDOWN_MS, 30_000)
  assert.equal(getDepartureChangeCooldownRemainingMs(null, now), 0)
  assert.equal(getDepartureChangeCooldownRemainingMs(undefined, now), 0)
  assert.equal(getDepartureChangeCooldownRemainingMs('2026-09-14T19:00:20+09:00', now), 20_000)
  assert.equal(getDepartureChangeCooldownRemainingMs('2026-09-14T18:59:00+09:00', now), 0)
  // 파싱할 수 없는 값 때문에 변경 자체가 막히면 안 된다.
  assert.equal(getDepartureChangeCooldownRemainingMs('not-a-date', now), 0)
})

test('푸시 트리거는 사람 메시지와 출발 시각 변경만 통과시킨다', () => {
  const sql = readMigration()

  const triggerMatch = sql.match(/create trigger on_message_created_push[\s\S]*?execute function public\.notify_new_message\(\);/)
  assert.ok(triggerMatch, 'on_message_created_push 트리거를 다시 만들어야 한다')

  assert.match(triggerMatch[0], /when \(new\.kind in \('user', 'departure_changed'\)\)/)
  // 입퇴장·방장 위임·인상착의는 푸시를 타면 안 된다.
  for (const kind of ['participant_joined', 'participant_left', 'host_changed', 'host_appearance']) {
    assert.doesNotMatch(triggerMatch[0], new RegExp(kind))
  }
})

test('안읽음 집계는 푸시와 같은 kind 기준을 쓴다', () => {
  const sql = readMigration()

  for (const fn of ['get_my_unread_count', 'get_my_unread_room_counts']) {
    const fnMatch = sql.match(new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?\\$\\$;`))
    assert.ok(fnMatch, `${fn} 를 다시 만들어야 한다`)
    assert.match(fnMatch[0], /and m\.kind in \('user', 'departure_changed'\)/)
  }
})

test('브라우저는 시스템 kind 로 메시지를 넣을 수 없다', () => {
  const sql = readMigration()

  const policyMatch = sql.match(/create policy "Active room participants can send messages"[\s\S]*?\);/)
  assert.ok(policyMatch, 'messages insert 정책을 다시 만들어야 한다')

  // 이 제한이 없으면 클라이언트가 departure_changed 를 위조해 참여자 전원에게 푸시를 쏠 수 있다.
  assert.match(policyMatch[0], /and kind in \('user', 'host_appearance'\)/)
})

test('방장의 자동 참여는 입장 메시지를 남기지 않는다', () => {
  const sql = readMigration()

  const fnMatch = sql.match(/create or replace function public\.log_room_membership_message\(\)[\s\S]*?\$\$;/)
  assert.ok(fnMatch)

  // 방을 만든 사람은 방이 열리는 순간 참여자로 들어간다 — 모든 방이
  // "○○님이 들어왔어요"로 시작하면 기록의 의미가 없다.
  assert.match(fnMatch[0], /v_created_by = new\.user_id[\s\S]*?return new;/)
})

test('시스템 메시지 기록 실패가 원래 작업을 막지 않는다', () => {
  const sql = readMigration()

  const fnMatch = sql.match(/create or replace function public\.insert_room_system_message\([\s\S]*?\$\$;/)
  assert.ok(fnMatch)

  // 방이 cascade 로 지워지는 중이면 FK 위반으로 방 삭제 자체가 실패할 수 있다.
  assert.match(fnMatch[0], /if not exists \(select 1 from public\.chat_rooms where id = p_room_id\) then/)
  assert.match(fnMatch[0], /exception when others then\s*\n\s*raise warning/)
})

test('출발 시각 변경은 창·방장·쿨다운을 SQL 안에서 판정한다', () => {
  const sql = readMigration()

  const fnMatch = sql.match(/create or replace function public\.change_room_departure_time\([\s\S]*?\$\$;/)
  assert.ok(fnMatch, 'change_room_departure_time RPC 가 있어야 한다')
  const body = fnMatch[0]

  // 서버 런타임은 UTC 라 창 판정을 JS 로 하면 9시간 어긋난다.
  assert.match(body, /clock_timestamp\(\) at time zone 'Asia\/Seoul'/)
  assert.match(body, /message = 'host_only'/)
  assert.match(body, /message = 'room_already_departed'/)
  assert.match(body, /message = 'departure_change_rate_limited'/)
  assert.match(body, /message = 'departure_time_out_of_window'/)
  // 동시 변경이 유니크 인덱스와 경합하지 않도록 대상 방을 잠근다.
  assert.match(body, /for update/)
  // title 에 시각이 박혀 있어 함께 갱신해야 한다.
  assert.match(body, /title = pg_catalog\.to_char\(p_departure_time, 'HH24:MI'\)/)
  // 방장 본인의 확정은 유지한다.
  assert.match(body, /room_participants\.user_id <> v_user_id/)
})

test('출발 시각 변경 라우트는 chat_rooms 를 직접 쓰지 않고 RPC 를 호출한다', () => {
  const source = readDepartureRoute()

  assert.match(source, /rpc\('change_room_departure_time'/)
  // admin 클라이언트로 직접 update 하면 KST 창 판정과 방장 검증을 우회한다.
  assert.doesNotMatch(source, /from\('chat_rooms'\)[\s\S]{0,120}\.update\(/)
})

test('출발 시각 변경 라우트는 안전한 오류 문구로만 응답한다', () => {
  const source = readDepartureRoute()

  // 같은 경로·시각의 활성 방 유니크 인덱스 위반.
  assert.match(source, /'23505'/)
  assert.match(source, /duplicate_active_room/)
  assert.match(source, /departure_change_rate_limited/)
  assert.match(source, /room_already_departed/)
  // 원시 Postgres 오류를 그대로 흘리지 않는다.
  assert.doesNotMatch(source, /error: error\.message/)
})
