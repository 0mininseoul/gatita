import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

// 이 프로젝트의 관례: 라우트를 실행하지 않고 소스를 읽어 패턴을 단언한다
// (test/push-dispatch-route.test.mjs, test/location-points.test.mjs:286 참고).
function readListRouteSource() {
  return readFileSync(join(process.cwd(), 'app/api/routes/route.ts'), 'utf8')
}

function readItemRouteSource() {
  return readFileSync(join(process.cwd(), 'app/api/routes/[id]/route.ts'), 'utf8')
}

test('두 라우트 모두 세션 클라이언트만 쓰고 admin(service_role) 클라이언트는 쓰지 않는다', () => {
  const listSource = readListRouteSource()
  const itemSource = readItemRouteSource()

  assert.match(listSource, /import \{ createClient \} from '@\/lib\/supabase\/server'/)
  assert.match(itemSource, /import \{ createClient \} from '@\/lib\/supabase\/server'/)

  // RLS가 백스톱이지만, admin 클라이언트를 쓰면 그 백스톱이 사라진다.
  // 이 라우트들은 절대로 admin 클라이언트를 참조해서는 안 된다.
  assert.doesNotMatch(listSource, /createAdminSupabase/)
  assert.doesNotMatch(itemSource, /createAdminSupabase/)
  assert.doesNotMatch(listSource, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(itemSource, /SUPABASE_SERVICE_ROLE_KEY/)
})

test('listRoutes/createRoute 는 인증을 가장 먼저 확인하고 미인증이면 401을 반환한다', () => {
  const source = readListRouteSource()

  const listFnMatch = source.match(/async function listRoutes\(\)[\s\S]*?\n\}/)
  const createFnMatch = source.match(/async function createRoute\(request: Request\)[\s\S]*?\n\}\n\nexport/)
  assert.ok(listFnMatch, 'listRoutes 함수가 존재해야 한다')
  assert.ok(createFnMatch, 'createRoute 함수가 존재해야 한다')

  for (const fnBody of [listFnMatch[0], createFnMatch[0]]) {
    const authCallIdx = fnBody.indexOf('auth.getUser()')
    const unauthorizedIdx = fnBody.indexOf("status: 401")
    const queryIdx = fnBody.search(/\.from\('favorites'\)/)

    assert.notEqual(authCallIdx, -1, 'auth.getUser 호출이 있어야 한다')
    assert.notEqual(unauthorizedIdx, -1, '401 응답이 있어야 한다')
    assert.ok(authCallIdx < unauthorizedIdx, '인증 확인이 401 응답보다 먼저 나와야 한다')
    assert.ok(unauthorizedIdx < queryIdx, '401 처리가 favorites 조회/변경보다 먼저 나와야 한다')
  }

  // createRoute는 본문을 파싱하기 전에 인증부터 확인해야 한다.
  const createBody = createFnMatch[0]
  const authIdx = createBody.indexOf('auth.getUser()')
  const bodyParseIdx = createBody.indexOf('request.json()')
  assert.ok(authIdx < bodyParseIdx, '인증 확인이 요청 본문 파싱보다 먼저여야 한다')
})

test('updateRoute/deleteRoute 는 인증을 가장 먼저 확인하고 미인증이면 401을 반환한다', () => {
  const source = readItemRouteSource()

  const updateFnMatch = source.match(/async function updateRoute\([\s\S]*?\n\}\n\nasync function deleteRoute/)
  const deleteFnMatch = source.match(/async function deleteRoute\([\s\S]*?\n\}\n\nexport/)
  assert.ok(updateFnMatch, 'updateRoute 함수가 존재해야 한다')
  assert.ok(deleteFnMatch, 'deleteRoute 함수가 존재해야 한다')

  for (const fnBody of [updateFnMatch[0], deleteFnMatch[0]]) {
    const authCallIdx = fnBody.indexOf('auth.getUser()')
    const unauthorizedIdx = fnBody.indexOf('status: 401')
    const queryIdx = fnBody.search(/\.from\('favorites'\)/)

    assert.notEqual(authCallIdx, -1, 'auth.getUser 호출이 있어야 한다')
    assert.notEqual(unauthorizedIdx, -1, '401 응답이 있어야 한다')
    assert.ok(authCallIdx < unauthorizedIdx, '인증 확인이 401 응답보다 먼저 나와야 한다')
    assert.ok(unauthorizedIdx < queryIdx, '401 처리가 favorites 조회/변경보다 먼저 나와야 한다')
  }

  // updateRoute는 본문을 파싱하기 전에 인증부터 확인해야 한다.
  const updateBody = updateFnMatch[0]
  const authIdx = updateBody.indexOf('auth.getUser()')
  const bodyParseIdx = updateBody.indexOf('request.json()')
  assert.ok(authIdx < bodyParseIdx, '인증 확인이 요청 본문 파싱보다 먼저여야 한다')
})

test('GET 목록 조회는 user_id로 스코프된다', () => {
  const source = readListRouteSource()

  const listFnMatch = source.match(/async function listRoutes\(\)[\s\S]*?\n\}/)
  assert.ok(listFnMatch)
  assert.match(listFnMatch[0], /\.from\('favorites'\)\s*\n\s*\.select\(SELECT\)\s*\n\s*\.eq\('user_id', user\.id\)/)
})

test('PATCH/DELETE는 id와 user_id 둘 다로 스코프되어 남의 행을 건드리지 못한다', () => {
  const source = readItemRouteSource()

  const updateFnMatch = source.match(/async function updateRoute\([\s\S]*?\n\}\n\nasync function deleteRoute/)
  const deleteFnMatch = source.match(/async function deleteRoute\([\s\S]*?\n\}\n\nexport/)
  assert.ok(updateFnMatch && deleteFnMatch)

  for (const [label, fnBody] of [['updateRoute', updateFnMatch[0]], ['deleteRoute', deleteFnMatch[0]]]) {
    const idScopeIdx = fnBody.indexOf(".eq('id', params.id)")
    const userScopeIdx = fnBody.indexOf(".eq('user_id', user.id)")
    assert.notEqual(idScopeIdx, -1, `${label}: id 스코프가 있어야 한다`)
    assert.notEqual(userScopeIdx, -1, `${label}: user_id 스코프가 있어야 한다`)
    assert.ok(idScopeIdx < userScopeIdx, `${label}: id 스코프 다음에 user_id 스코프가 이어져야 한다 (둘 다 걸려야 함)`)
  }
})

test('PATCH/DELETE는 대상이 없거나 남의 것이면 성공한 척하지 않고 404를 반환한다', () => {
  const source = readItemRouteSource()

  const updateFnMatch = source.match(/async function updateRoute\([\s\S]*?\n\}\n\nasync function deleteRoute/)
  const deleteFnMatch = source.match(/async function deleteRoute\([\s\S]*?\n\}\n\nexport/)
  assert.ok(updateFnMatch && deleteFnMatch)

  // update: 존재 여부를 select().maybeSingle() 결과로 판정
  const updateBody = updateFnMatch[0]
  assert.match(updateBody, /\.select\(SELECT\)\s*\n\s*\.maybeSingle\(\)/)
  assert.match(updateBody, /if \(!route\) \{\s*\n\s*return NextResponse\.json\(\{ error: '경로를 찾을 수 없습니다' \}, \{ status: 404 \}\)/)

  // delete: delete()만으로는 0건 삭제와 1건 삭제를 구분할 수 없으므로,
  // 지워진 행을 select로 되받아 존재 여부를 확인해야 한다.
  const deleteBody = deleteFnMatch[0]
  assert.match(deleteBody, /\.delete\(\)/)
  assert.match(deleteBody, /\.select\('id'\)\s*\n\s*\.maybeSingle\(\)/)
  assert.match(deleteBody, /if \(!deleted\) \{\s*\n\s*return NextResponse\.json\(\{ error: '경로를 찾을 수 없습니다' \}, \{ status: 404 \}\)/)

  // delete가 select보다 먼저 호출되어야, 삭제된 행이 select로 되돌아오는 순서가 맞다.
  const deleteCallIdx = deleteBody.indexOf('.delete()')
  const selectCallIdx = deleteBody.indexOf(".select('id')")
  assert.ok(deleteCallIdx < selectCallIdx, 'delete()가 select()보다 먼저 체이닝되어야 한다')
})

test('POST 생성 경로는 isRestrictedRoutePair로 근거리 경로를 막는다', () => {
  const source = readListRouteSource()

  assert.match(source, /import \{ isRestrictedRoutePair, LOCATIONS, type LocationType \} from '@\/lib\/supabase'/)

  const createFnMatch = source.match(/async function createRoute\(request: Request\)[\s\S]*?\n\}\n\nexport/)
  assert.ok(createFnMatch)
  assert.match(
    createFnMatch[0],
    /if \(from === to \|\| isRestrictedRoutePair\(from, to\)\) \{\s*\n\s*return NextResponse\.json\(\{ error: '선택할 수 없는 경로입니다' \}, \{ status: 400 \}\)/,
  )
})

test('POST는 notify_from === notify_to 를 400으로 거부하되, 둘 다 null인 종일 구독은 허용한다', () => {
  const source = readListRouteSource()

  const createFnMatch = source.match(/async function createRoute\(request: Request\)[\s\S]*?\n\}\n\nexport/)
  assert.ok(createFnMatch)
  const body = createFnMatch[0]

  // isWithinNotifyWindow는 notify_from > notify_to 일 때만 자정 넘김으로 해석하므로
  // notify_from === notify_to (예: 09:00~09:00)는 그 1분만 통과하는 죽은 구독이 된다.
  assert.match(
    body,
    /if \(notifyFrom !== null && notifyFrom === notifyTo\) \{\s*\n\s*return NextResponse\.json\(\{ error: '[^']+' \}, \{ status: 400 \}\)/,
    'notify_from === notify_to (둘 다 non-null) 는 400 이어야 한다',
  )

  // null 가드가 없으면 종일 구독(둘 다 null)도 "같다"는 이유로 잘못 거부된다.
  // 가드 존재를 텍스트로만 확인하지 않고, 정지 조건이 null 값을 포함하지 않는지
  // 구조적으로 확인한다: 페어링 검사(둘 다 null 이거나 둘 다 non-null)가 동등성
  // 검사보다 먼저 나오고, 동등성 검사 자체가 notifyFrom !== null 가드를 갖는다.
  const pairingIdx = body.indexOf('(notifyFrom === null) !== (notifyTo === null)')
  const equalityIdx = body.indexOf('notifyFrom !== null && notifyFrom === notifyTo')
  assert.notEqual(pairingIdx, -1)
  assert.notEqual(equalityIdx, -1)
  assert.ok(pairingIdx < equalityIdx, '페어링 검사가 동등성 검사보다 먼저 나와야 한다')
})

test('PATCH는 notify_from === notify_to 를 400으로 거부하되, 둘 다 null로 되돌리는 것은 허용한다', () => {
  const source = readItemRouteSource()

  const updateFnMatch = source.match(/async function updateRoute\([\s\S]*?\n\}\n\nasync function deleteRoute/)
  assert.ok(updateFnMatch)
  const body = updateFnMatch[0]

  assert.match(
    body,
    /if \(patch\.notify_from !== null && patch\.notify_from === patch\.notify_to\) \{\s*\n\s*return NextResponse\.json\(\{ error: '[^']+' \}, \{ status: 400 \}\)/,
    'patch.notify_from === patch.notify_to (둘 다 non-null) 는 400 이어야 한다',
  )

  const pairingIdx = body.indexOf("('notify_from' in patch) !== ('notify_to' in patch)")
  const equalityIdx = body.indexOf('patch.notify_from !== null && patch.notify_from === patch.notify_to')
  assert.notEqual(pairingIdx, -1)
  assert.notEqual(equalityIdx, -1)
  assert.ok(pairingIdx < equalityIdx, '페어링 검사가 동등성 검사보다 먼저 나와야 한다')
})

test('네 핸들러 모두 withAxiomRoute로 감싸져 export된다', () => {
  const listSource = readListRouteSource()
  const itemSource = readItemRouteSource()

  assert.match(listSource, /export const GET = withAxiomRoute\(listRoutes\)/)
  assert.match(listSource, /export const POST = withAxiomRoute\(createRoute\)/)
  assert.match(itemSource, /export const PATCH = withAxiomRoute\(updateRoute\)/)
  assert.match(itemSource, /export const DELETE = withAxiomRoute\(deleteRoute\)/)
})

test('응답 select 목록은 RouteSubscriptionRow 필드와 일치한다', () => {
  const listSource = readListRouteSource()
  const itemSource = readItemRouteSource()

  const expectedSelect = "id, from_location, to_location, notify_enabled, notify_from, notify_to, notify_weekdays"
  assert.match(listSource, new RegExp(`const SELECT = '${expectedSelect}'`))
  assert.match(itemSource, new RegExp(`const SELECT = '${expectedSelect}'`))
})

test('favorites 테이블에 notify_* 컬럼 update grant가 있다 (PATCH가 동작하려면 필요)', () => {
  // favorites는 원래 select, insert, delete만 부여되어 update grant가 없었다.
  // RLS 정책이 update를 허용해도 명시적 grant가 없으면 PostgREST가 permission denied로
  // 막으므로, PATCH 라우트가 실제로 동작하려면 이 grant가 스키마/마이그레이션에 있어야 한다.
  const schema = readFileSync(join(process.cwd(), 'supabase_schema.sql'), 'utf8')
  assert.match(
    schema,
    /grant update \(notify_enabled, notify_from, notify_to, notify_weekdays\)\s*\n\s*on table public\.favorites to authenticated;/,
  )

  const migration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260806093000_grant_favorites_notify_update.sql'),
    'utf8',
  )
  assert.match(
    migration,
    /grant update \(notify_enabled, notify_from, notify_to, notify_weekdays\)\s*\n\s*on table public\.favorites to authenticated;/,
  )
})
