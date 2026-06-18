import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function cssBlock(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`))

  assert.ok(match?.groups?.body, `${selector} block exists`)
  return match.groups.body
}

test('chat room sizes the shell to the visible viewport instead of translating the input bar', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /const viewportHeight = visualViewport\?\.height \?\? window\.innerHeight/)
  assert.doesNotMatch(source, /translateY\(calc\(-1 \* var\(--chat-keyboard-offset\)\)\)/)
  assert.match(source, /style=\{\{ height: 'var\(--chat-viewport-height\)' \}\}/)
})

test('chat bubbles use compact mobile messenger spacing', () => {
  const source = readProjectFile('app/globals.css')
  const block = cssBlock(source, '.chat-message')

  assert.match(block, /padding:\s*0\.45rem 0\.7rem;/)
  assert.match(block, /border-radius:\s*0\.875rem;/)
  assert.match(block, /line-height:\s*1\.35;/)
  assert.doesNotMatch(block, /@apply\s+p-3/)
})
