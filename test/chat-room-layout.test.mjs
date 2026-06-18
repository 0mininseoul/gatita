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

test('chat room uses fixed messenger chrome with document scroll locking', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /headerRef/)
  assert.match(source, /composerRef/)
  assert.match(source, /--chat-keyboard-inset/)
  assert.match(source, /className="chat-room-header/)
  assert.match(source, /className="chat-messages/)
  assert.match(source, /className="chat-composer/)
  assert.match(source, /body\.style\.position\s*=\s*'fixed'/)
  assert.match(source, /body\.style\.inset\s*=\s*'0'/)
  assert.match(source, /focus\(\{ preventScroll: true \}\)/)
  assert.doesNotMatch(source, /translateY\(calc\(-1 \* var\(--chat-keyboard-offset\)\)\)/)
})

test('chat room CSS keeps the header fixed while the keyboard only moves the lower chrome', () => {
  const source = readProjectFile('app/globals.css')
  const shellBlock = cssBlock(source, '.chat-shell')
  const headerBlock = cssBlock(source, '.chat-room-header')
  const messagesBlock = cssBlock(source, '.chat-messages')
  const composerBlock = cssBlock(source, '.chat-composer')

  assert.match(shellBlock, /height:\s*100%;/)
  assert.doesNotMatch(shellBlock, /height:\s*100dvh;/)
  assert.match(headerBlock, /top:\s*0;/)
  assert.match(messagesBlock, /padding-top:\s*calc\(var\(--chat-header-height\) \+ 0\.75rem\);/)
  assert.match(messagesBlock, /bottom:\s*calc\(var\(--chat-composer-height\) \+ var\(--chat-keyboard-inset\)\);/)
  assert.match(messagesBlock, /padding-bottom:\s*0\.75rem;/)
  assert.doesNotMatch(messagesBlock, /padding-bottom:[^;]*--chat-keyboard-inset/)
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

test('chat message timestamps are hidden until the message list is dragged left', () => {
  const pageSource = readProjectFile('app/rooms/[id]/page.tsx')
  const cssSource = readProjectFile('app/globals.css')
  const rowBlock = cssBlock(cssSource, '.chat-message-row')
  const stackBlock = cssBlock(cssSource, '.chat-message-bubble-stack')
  const timeBlock = cssBlock(cssSource, '.chat-message-time')

  assert.match(pageSource, /MAX_TIMESTAMP_REVEAL/)
  assert.match(pageSource, /timestampReveal/)
  assert.match(pageSource, /handleMessagesPointerDown/)
  assert.match(pageSource, /onPointerMove=\{handleMessagesPointerMove\}/)
  assert.match(pageSource, /className=\{`chat-message-row/)
  assert.match(pageSource, /chat-message-bubble-stack/)
  assert.match(pageSource, /<time className="chat-message-time"/)
  assert.doesNotMatch(pageSource, /<p className="mt-0\.5 px-1 text-xs text-gray-400">/)
  assert.match(rowBlock, /position:\s*relative;/)
  assert.match(stackBlock, /transform:\s*translateX\(calc\(-1 \* var\(--timestamp-reveal\)\)\);/)
  assert.match(timeBlock, /opacity:\s*var\(--timestamp-opacity\);/)
  assert.match(timeBlock, /pointer-events:\s*none;/)
})

test('chat keyboard viewport sync does not animate the message list on every keyboard frame', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')
  const syncStart = source.indexOf('const syncAndPinChat =')
  const syncEnd = source.indexOf('\n  useEffect', syncStart)
  const syncBlock = source.slice(syncStart, syncEnd)

  assert.ok(syncStart > -1, 'syncAndPinChat exists')
  assert.ok(syncEnd > syncStart, 'syncAndPinChat block can be inspected')
  assert.match(source, /const syncChatChrome = useCallback/)
  assert.match(source, /pinLatestMessageIfScrollable/)
  assert.match(source, /window\.setTimeout\(syncKeyboardViewport, 240\)/)
  assert.doesNotMatch(syncBlock, /scrollToBottom/)
  assert.doesNotMatch(source, /setProperty\('--chat-viewport-offset-top'/)
  assert.doesNotMatch(source, /visualViewport\?\.addEventListener\('scroll'/)
  assert.doesNotMatch(source, /visualViewport\.height - viewportOffsetTop/)
})

test('chat room syncs chrome and scrolls history immediately after initial render', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /useLayoutEffect/)
  assert.match(source, /syncInitialChatViewport/)
  assert.match(source, /if \(loading \|\| !room \|\| !user\) return/)
  assert.match(source, /scrollToBottom\('auto'\)/)
})

test('chat history loads message rows even if embedded author loading is unavailable', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')
  const loadStart = source.indexOf('const loadMessages = useCallback')
  const loadEnd = source.indexOf('\n  const loadParticipants', loadStart)
  const loadBlock = source.slice(loadStart, loadEnd)

  assert.ok(loadStart > -1, 'loadMessages exists')
  assert.ok(loadEnd > loadStart, 'loadMessages block can be inspected')
  assert.match(loadBlock, /\.select\('id, room_id, user_id, content, created_at'\)/)
  assert.match(loadBlock, /authorIds/)
  assert.match(loadBlock, /\.from\('users'\)/)
  assert.match(loadBlock, /\.in\('id', authorIds\)/)
  assert.match(loadBlock, /setMessages\(messagesWithAuthors as Message\[\]\)/)
  assert.doesNotMatch(loadBlock, /user:users\(nickname, department\)/)
})

test('chat room hides participant chips behind a participant sheet and shows creator payout account', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.doesNotMatch(source, /participant\.confirmed \? 'bg-green-100/, 'participant chips should not be publicly rendered inline')
  assert.doesNotMatch(source, /absolute -right-0\.5 -top-0\.5/, 'participant header action should not show a numeric badge')
  assert.match(source, /showParticipants/, 'participants should be shown from an explicit header action')
  assert.match(source, /참여자/, 'chat header should include participant list affordance')
  assert.match(source, /href=\{`tel:\$\{participant\.user\?\.phone\}`\}/, 'participant list should allow direct phone calls')
  assert.match(source, /user:users\(nickname, department, phone\)/, 'participant query should include phone numbers for the participant sheet')
  assert.match(source, /user_payout_accounts/, 'chat room should load room creator payout account')
  assert.match(source, /방장 계좌/, 'creator payout account should replace the old participant chip area')
  assert.match(source, /account_number/, 'creator payout account should display the account number')
})

test('chat room can copy the room creator payout account', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /copyCreatorPayoutAccount/)
  assert.match(source, /navigator\.clipboard\.writeText/)
  assert.match(source, /복사/)
  assert.match(source, /계좌 정보를 복사했습니다/)
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

test('kakao map zoom control is offset below the app header', () => {
  const mapSource = readProjectFile('components/CampusRouteMap.tsx')
  const cssSource = readProjectFile('app/globals.css')

  assert.match(mapSource, /gatita-custom-zoom-control/)
  assert.match(mapSource, /handleZoomIn/)
  assert.match(mapSource, /handleZoomOut/)
  assert.match(cssSource, /\.gatita-custom-zoom-control/)
  assert.match(cssSource, /top:\s*12\.75rem;/)
})

test('map stats are offset from the translucent PWA status bar and room joins disable after departure', () => {
  const mapSource = readProjectFile('components/CampusRouteMap.tsx')
  const cssSource = readProjectFile('app/globals.css')

  assert.match(mapSource, /gatita-map-stats/)
  assert.match(cssSource, /\.gatita-map-stats/)
  assert.match(cssSource, /env\(safe-area-inset-top\) \+ 5rem/)
  assert.doesNotMatch(cssSource, /9\.25rem/, 'map stat chips should not be pushed deep below the header')
  assert.match(mapSource, /isRoomJoinable/)
  assert.match(mapSource, /isPastDeparture/)
  assert.match(mapSource, /disabled=\{isFull \|\| isPastDeparture\}/)
})
