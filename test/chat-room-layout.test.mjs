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

test('chat room uses fixed messenger chrome without locking the body position', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /headerRef/)
  assert.match(source, /composerRef/)
  assert.match(source, /--chat-keyboard-inset/)
  assert.match(source, /className="chat-room-header/)
  assert.match(source, /className="chat-messages/)
  assert.match(source, /className="chat-composer/)
  assert.doesNotMatch(source, /body\.style\.position\s*=\s*'fixed'/)
  assert.doesNotMatch(source, /body\.style\.inset\s*=\s*'0'/)
  assert.doesNotMatch(source, /translateY\(calc\(-1 \* var\(--chat-keyboard-offset\)\)\)/)
})

test('chat room CSS reserves header, composer, and keyboard space inside the message scroller', () => {
  const source = readProjectFile('app/globals.css')
  const messagesBlock = cssBlock(source, '.chat-messages')
  const composerBlock = cssBlock(source, '.chat-composer')

  assert.match(messagesBlock, /padding-top:\s*calc\(var\(--chat-header-height\) \+ 0\.75rem\);/)
  assert.match(messagesBlock, /padding-bottom:\s*calc\(var\(--chat-composer-height\) \+ var\(--chat-keyboard-inset\) \+ 0\.75rem\);/)
  assert.match(composerBlock, /bottom:\s*var\(--chat-keyboard-inset\);/)
})

test('chat bubbles use compact mobile messenger spacing', () => {
  const source = readProjectFile('app/globals.css')
  const block = cssBlock(source, '.chat-message')

  assert.match(block, /padding:\s*0\.45rem 0\.7rem;/)
  assert.match(block, /border-radius:\s*0\.875rem;/)
  assert.match(block, /line-height:\s*1\.35;/)
  assert.doesNotMatch(block, /@apply\s+p-3/)
})

test('map app and bottom sheet use the visual viewport and internal sheet scrolling', () => {
  const pageSource = readProjectFile('app/page.tsx')
  const mapSource = readProjectFile('components/CampusRouteMap.tsx')
  const cssSource = readProjectFile('app/globals.css')
  const sheetBlock = cssBlock(cssSource, '.gatita-bottom-sheet')

  assert.match(pageSource, /--app-viewport-height/)
  assert.match(pageSource, /window\.visualViewport\?\.height \?\? window\.innerHeight/)
  assert.match(pageSource, /style=\{\{ height: 'var\(--app-viewport-height\)' \}\}/)
  assert.match(mapSource, /className="gatita-bottom-sheet/)
  assert.match(mapSource, /className="gatita-bottom-sheet-body/)
  assert.doesNotMatch(mapSource, /bottom-3/)
  assert.match(sheetBlock, /max-height:\s*min\(72vh, calc\(var\(--app-viewport-height\) - 8\.75rem\)\);/)
  assert.match(sheetBlock, /bottom:\s*max\(1rem, env\(safe-area-inset-bottom\)\);/)
})
