import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function loadServiceShareExports() {
  const source = readProjectFile('lib/serviceShare.ts')
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

test('service share intent is recognized only for share=1', () => {
  assert.equal(existsSync(join(process.cwd(), 'lib/serviceShare.ts')), true)
  const { hasServiceShareIntent } = loadServiceShareExports()

  assert.equal(hasServiceShareIntent('?share=1&utm_source=welcome_email'), true)
  assert.equal(hasServiceShareIntent('?share=0'), false)
  assert.equal(hasServiceShareIntent('?utm_source=welcome_email'), false)
})

test('service share payload uses the canonical site URL without email tracking parameters', () => {
  const { buildServiceSharePayload } = loadServiceShareExports()
  const payload = buildServiceSharePayload('https://gatita.kro.kr/?share=1&utm_source=welcome_email')

  assert.equal(payload.title, '같이타')
  assert.equal(payload.url, 'https://gatita.kro.kr/')
  assert.match(payload.text, /가천대/)
  assert.match(payload.text, /같이타/)
  assert.doesNotMatch(payload.url, /share=1|utm_/)
})

test('service share intent removal preserves other query parameters and the hash', () => {
  const { removeServiceShareIntent } = loadServiceShareExports()

  assert.equal(
    removeServiceShareIntent('https://gatita.kro.kr/map?share=1&utm_source=welcome_email#rooms'),
    '/map?utm_source=welcome_email#rooms',
  )
})

test('service sharing opens the native share sheet with the canonical payload', async () => {
  const { shareService } = loadServiceShareExports()
  let receivedPayload

  const result = await shareService('https://gatita.kro.kr/?share=1&utm_source=welcome_email', {
    share: async (payload) => {
      receivedPayload = payload
    },
  })

  assert.equal(result, 'shared')
  assert.equal(receivedPayload.url, 'https://gatita.kro.kr/')
  assert.doesNotMatch(receivedPayload.url, /share=1|utm_/)
})

test('service sharing falls back to copying the message and canonical link', async () => {
  const { buildServiceShareFallbackText, buildServiceSharePayload, shareService } = loadServiceShareExports()
  let copiedText = ''

  const result = await shareService('https://gatita.kro.kr/?share=1', {
    clipboard: {
      writeText: async (text) => {
        copiedText = text
      },
    },
  })

  assert.equal(result, 'copied')
  assert.equal(
    copiedText,
    buildServiceShareFallbackText(buildServiceSharePayload('https://gatita.kro.kr/?share=1')),
  )
})

test('service sharing treats a cancelled native share as recoverable and rethrows real failures', async () => {
  const { shareService } = loadServiceShareExports()

  assert.equal(
    await shareService('https://gatita.kro.kr/?share=1', {
      share: async () => {
        throw new DOMException('cancelled', 'AbortError')
      },
    }),
    'cancelled',
  )

  await assert.rejects(
    shareService('https://gatita.kro.kr/?share=1', {
      share: async () => {
        throw new Error('native share failed')
      },
    }),
    /native share failed/,
  )

  await assert.rejects(
    shareService('https://gatita.kro.kr/?share=1', {}),
    /unavailable/,
  )
})

test('home share intent opens an accessible prompt and shares from a user click with a copy fallback', () => {
  const source = readProjectFile('components/HomeClient.tsx')

  assert.match(source, /hasServiceShareIntent\(window\.location\.search\)/)
  assert.match(source, /setShowServiceSharePrompt\(true\)/)
  assert.match(source, /aria-labelledby="service-share-title"/)
  assert.match(source, /친구에게 같이타를 알려주세요/)
  assert.match(source, /handleShareService/)
  assert.match(source, /shareService\(window\.location\.href, navigator\)/)
  assert.match(source, /친구에게 공유하기/)
})
