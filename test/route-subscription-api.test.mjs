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

test('POST 생성 경로는 공유 검증 함수(buildRouteCreateInput)에 위치·제한 경로 판정을 위임한다', () => {
  const source = readListRouteSource()

  assert.match(source, /import \{ isRestrictedRoutePair, LOCATIONS, type LocationType \} from '@\/lib\/supabase'/)
  assert.match(source, /import \{ buildRouteCreateInput \} from '@\/lib\/routeSubscriptionValidation'/)

  const createFnMatch = source.match(/async function createRoute\(request: Request\)[\s\S]*?\n\}\n\nexport/)
  assert.ok(createFnMatch)
  assert.match(createFnMatch[0], /buildRouteCreateInput\(/)
  assert.match(createFnMatch[0], /Object\.keys\(LOCATIONS\)/)
  assert.match(createFnMatch[0], /isRestrictedRoutePair\(from as LocationType, to as LocationType\)/)

  // 실제 위치 유효성 판정/제한 경로 거부/from===to 거부 동작은 lib/routeSubscriptionValidation.ts를
  // 직접 호출하는 test/route-subscription-validation.test.mjs에서 검증한다.
})

// 예전에는 POST/PATCH가 각자 notify_from === notify_to 페어링·동등성 검사를 인라인으로
// 들고 있었다. PATCH 쪽 인라인 가드(`patch.notify_from !== null && patch.notify_from ===
// patch.notify_to`)는 부분 업데이트에서 키 자체가 없을 때 patch.notify_from이 undefined가
// 되는 걸 놓쳐, undefined === undefined가 true로 평가되면서 { notify_enabled: false }만
// 보내는 흔한 토글 요청까지 400으로 잘못 거부하는 Critical 버그가 있었다. 지금은 두 라우트
// 모두 lib/routeSubscriptionValidation.ts의 공유 함수에 이 검사를 위임해 로직이 한 곳에만
// 존재한다 — 실제 판정 동작(presence 기반 undefined/null 구분, 자정 넘김 허용 등)은
// test/route-subscription-validation.test.mjs가 함수를 직접 호출해 검증한다.
test('POST/PATCH는 notify_from/notify_to 페어링·동등성 검사를 공유 함수에 위임하고, 더 이상 각자 인라인으로 비교하지 않는다', () => {
  const listSource = readListRouteSource()
  const itemSource = readItemRouteSource()

  assert.match(listSource, /import \{ buildRouteCreateInput \} from '@\/lib\/routeSubscriptionValidation'/)
  assert.match(itemSource, /import \{ buildRouteUpdatePatch \} from '@\/lib\/routeSubscriptionValidation'/)

  const createFnMatch = listSource.match(/async function createRoute\(request: Request\)[\s\S]*?\n\}\n\nexport/)
  const updateFnMatch = itemSource.match(/async function updateRoute\([\s\S]*?\n\}\n\nasync function deleteRoute/)
  assert.ok(createFnMatch && updateFnMatch)

  assert.match(createFnMatch[0], /buildRouteCreateInput\(/)
  assert.match(updateFnMatch[0], /buildRouteUpdatePatch\(body\)/)

  // 어느 라우트도 더 이상 notify_from/notify_to를 직접 비교하지 않는다 — 이 비교가
  // 라우트 안에도 남아있으면 두 곳의 로직이 다시 어긋날 여지가 생긴다.
  assert.doesNotMatch(createFnMatch[0], /notifyFrom === notifyTo/)
  assert.doesNotMatch(updateFnMatch[0], /notify_from === .*notify_to/)
})

test('lib/routeSubscriptionValidation.ts가 notify_from === notify_to 동등성 검사를 유일하게 소유한다', () => {
  const validationSource = readFileSync(
    join(process.cwd(), 'lib/routeSubscriptionValidation.ts'),
    'utf8',
  )

  // isWithinNotifyWindow는 notify_from > notify_to 일 때만 자정 넘김으로 해석하므로
  // notify_from === notify_to (예: 09:00~09:00)는 그 1분만 통과하는 죽은 구독이 된다.
  assert.match(
    validationSource,
    /if \(notifyFrom !== null && notifyFrom === notifyTo\) \{\s*\n\s*return \{ ok: false, error: '[^']+' \}/,
    'notify_from === notify_to (둘 다 non-null) 는 거부해야 한다',
  )

  // presence(키 존재 여부) 검사가 동등성 검사보다 먼저 나와야, 부분 업데이트에서
  // 키 자체가 없는 경우(undefined)와 명시적으로 null인 경우가 뒤섞이지 않는다.
  const pairingIdx = validationSource.indexOf('hasFrom !== hasTo')
  const equalityIdx = validationSource.indexOf('notifyFrom !== null && notifyFrom === notifyTo')
  assert.notEqual(pairingIdx, -1)
  assert.notEqual(equalityIdx, -1)
  assert.ok(pairingIdx < equalityIdx, 'presence 페어링 검사가 동등성 검사보다 먼저 나와야 한다')
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

test('favorites 테이블에 upsert가 요구하는 테이블 전체 update grant가 있다 (POST/PATCH 둘 다 동작하려면 필요)', () => {
  // favorites는 원래 select, insert, delete만 부여되어 update grant가 없었다.
  // 이후 PATCH 전용으로 notify_* 4개 컬럼만 좁힌 grant를 추가했지만(20260806093000),
  // POST /api/routes의 upsert(.upsert(..., { onConflict: 'user_id,from_location,to_location' }))는
  // PostgREST가 ON CONFLICT DO UPDATE SET <payload의 모든 컬럼> = EXCLUDED.<컬럼>으로
  // 전개하고, PostgreSQL은 충돌 발생 여부와 무관하게 SET 대상 전체 컬럼(user_id/
  // from_location/to_location 포함)에 ACL_UPDATE를 검사한다. notify_* 컬럼만 좁힌 grant는
  // 이 upsert 경로를 permission denied로 깼다(C-1 최종 리뷰 발견). 20260807000000이
  // 테이블 전체 update grant로 넓혔다 — RLS(auth.uid() = user_id, using만 지정)가 행을
  // 스코프하므로 소유자 이전은 여전히 불가능하다.
  const schema = readFileSync(join(process.cwd(), 'supabase_schema.sql'), 'utf8')
  assert.match(
    schema,
    /grant select, insert, update, delete on table public\.favorites to authenticated;/,
  )

  const migration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260807000000_grant_favorites_full_update.sql'),
    'utf8',
  )
  assert.match(
    migration,
    /grant update on table public\.favorites to authenticated;/,
  )
})
