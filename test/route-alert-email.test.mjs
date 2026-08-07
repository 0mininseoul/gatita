import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

function loadEmailExports() {
  const source = readFileSync(join(process.cwd(), 'lib/route-alert-email.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })

  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(() => ({}), module, module.exports)
  return module.exports
}

test('안내 메일은 이름을 이스케이프한다', () => {
  const { createRouteAlertEmail } = loadEmailExports()
  const email = createRouteAlertEmail('<script>alert(1)</script>')

  assert.equal(email.html.includes('<script>'), false)
  assert.equal(email.html.includes('&lt;script&gt;'), true)
})

test('안내 메일은 경로 화면 CTA 와 수신거부 링크를 포함한다', () => {
  const { createRouteAlertEmail } = loadEmailExports()
  const email = createRouteAlertEmail('박영민')

  assert.match(email.html, /https:\/\/gatita\.kro\.kr\/routes/)
  assert.match(email.html, /utm_campaign=route_alerts/)
  assert.match(email.html, /수신거부|수신 거부/)
  assert.match(email.text, /https:\/\/gatita\.kro\.kr\/routes/)
})

test('이름이 비어도 기본 호칭을 쓴다', () => {
  const { createRouteAlertEmail } = loadEmailExports()
  const email = createRouteAlertEmail('   ')

  assert.match(email.html, /회원/)
})
