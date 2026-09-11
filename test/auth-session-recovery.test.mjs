import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const helperPath = join(process.cwd(), 'lib/authRecovery.ts')

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function loadAuthRecoveryExports() {
  const source = readFileSync(helperPath, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })

  const module = { exports: {} }
  new Function('module', 'exports', outputText)(module, module.exports)
  return module.exports
}

test('a session the server rejects is recovered by signing out locally', () => {
  assert.equal(existsSync(helperPath), true, 'lib/authRecovery.ts should exist')
  const { resolveAuthFailureRecovery } = loadAuthRecoveryExports()

  // 서버가 세션을 거부했다. 쿠키에 남은 액세스 토큰은 아직 만료 전이라
  // 클라이언트 getSession()은 계속 성공하므로, 지우지 않으면 무한 루프가 된다.
  assert.equal(resolveAuthFailureRecovery(401), 'sign_out')
  assert.equal(resolveAuthFailureRecovery(403), 'sign_out')
})

test('transient failures keep the session so the user can retry', () => {
  const { resolveAuthFailureRecovery } = loadAuthRecoveryExports()

  assert.equal(resolveAuthFailureRecovery(500), 'retry')
  assert.equal(resolveAuthFailureRecovery(503), 'retry')
  assert.equal(resolveAuthFailureRecovery(429), 'retry')
  // 네트워크 오류로 상태 코드 자체를 받지 못한 경우.
  assert.equal(resolveAuthFailureRecovery(undefined), 'retry')
  assert.equal(resolveAuthFailureRecovery(null), 'retry')
})

test('HomeClient clears a server-rejected session instead of re-rendering the landing', () => {
  const source = readProjectFile('components/HomeClient.tsx')

  assert.match(source, /resolveAuthFailureRecovery/, 'checkAuth should classify profile fetch failures')
  assert.match(
    source,
    /signOut\(\{\s*scope:\s*'local'\s*\}\)/,
    'a rejected session must be cleared locally so the landing offers Google login again',
  )
  assert.match(source, /auth_session_rejected/, 'the rejection should be measurable in analytics')
})

test('visit tracking stops retrying once the server rejects the session', () => {
  const source = readProjectFile('components/AnalyticsProvider.tsx')

  assert.match(
    source,
    /resolveAuthFailureRecovery/,
    'a 401 never becomes a 200 by retrying, and each retry re-enters the auth middleware',
  )
})
