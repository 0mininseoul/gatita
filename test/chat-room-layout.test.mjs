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
  assert.match(source, /isComposerFocusedRef/)
  assert.match(source, /visualViewportBaselineRef/)
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
  assert.match(composerBlock, /padding-bottom:\s*max\(0\.5rem, calc\(env\(safe-area-inset-bottom\) \* 0\.38\)\);/)
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
  assert.doesNotMatch(source, /window\.innerHeight - visualViewport\.height/)
  assert.match(source, /visualViewportBaselineRef\.current - viewportHeight/)
  assert.match(source, /isComposerFocusedRef\.current/)
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

test('chat message author labels are shown only at the start of consecutive user groups', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /messages\.map\(\(message, index\) =>/)
  assert.match(source, /previousMessage = messages\[index - 1\]/)
  assert.match(source, /nextMessage = messages\[index \+ 1\]/)
  assert.match(source, /startsMessageGroup = !previousMessage \|\| previousMessage\.user_id !== message\.user_id/)
  assert.match(source, /!isOwnMessage && startsMessageGroup &&/)
  assert.match(source, /chat-message-author/)
  assert.match(source, /is-same-author/)
})

test('chat guide modals use aligned compact checklist rows', () => {
  const css = readProjectFile('app/globals.css')
  const page = readProjectFile('app/rooms/[id]/page.tsx')
  const guideLineBlock = cssBlock(css, '.chat-guide-line')

  assert.match(css, /\.chat-guide-sheet/)
  assert.match(css, /\.chat-guide-card/)
  assert.match(css, /\.chat-guide-icon/)
  assert.match(guideLineBlock, /grid-template-columns:\s*1\.7rem minmax\(0, 1fr\);/)
  assert.match(guideLineBlock, /letter-spacing:\s*0;/)
  assert.match(guideLineBlock, /font-size:\s*0\.6875rem;/)
  assert.match(guideLineBlock, /line-height:\s*1\.42;/)
  assert.match(page, /동행 전 체크/)
  assert.match(page, /출발 전 체크/)
  assert.doesNotMatch(page, /tracking-\[-0\.08em\]/)
})

test('chat room hides participant chips behind a participant sheet and shows creator payout account', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.doesNotMatch(source, /participant\.confirmed \? 'bg-green-100/, 'participant chips should not be publicly rendered inline')
  assert.doesNotMatch(source, /absolute -right-0\.5 -top-0\.5/, 'participant header action should not show a numeric badge')
  assert.match(source, /showParticipants/, 'participants should be shown from an explicit header action')
  assert.match(source, /참여자/, 'chat header should include participant list affordance')
  assert.match(source, /handleCallParticipant/, 'participant list should allow guarded phone calls')
  assert.doesNotMatch(source, /href=\{`tel:\$\{participant\.user\?\.phone\}`\}/, 'participant sheet should not expose direct tel links before consent')
  assert.match(source, /user:users\(nickname, department, phone\)/, 'participant query should include phone numbers for the participant sheet')
  assert.match(source, /user_payout_accounts/, 'chat room should load room creator payout account')
  assert.match(source, /방장 계좌/, 'creator payout account should replace the old participant chip area')
  assert.match(source, /account_number/, 'creator payout account should display the account number')
})

test('chat room folds phone privacy guidance into the entry guide and confirms before dialing', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.doesNotMatch(source, /showPhonePrivacyNotice/)
  assert.doesNotMatch(source, /phonePrivacyNoticeStorageKey/)
  assert.doesNotMatch(source, /gatita:room-phone-privacy-notice:/)
  assert.doesNotMatch(source, /안전번호/)
  assert.match(source, /방장과 멤버들은 서로 전화번호가 노출될 수 있어요\. 지각, 노쇼, 출발 위치 확인 등 동행 목적에만 사용해주세요\./)
  assert.doesNotMatch(source, /방장과 멤버들은 서로 전화번호가 노출될 수 있어요\.\s*<br \/>/)
  assert.doesNotMatch(source, /📞 방장과 멤버들은 서로 전화번호가 노출될 수 있습니다/)
  assert.match(source, /chat-guide-card/)
  assert.match(source, /chat-guide-line/)
  assert.match(source, /selectedCallParticipant/)
  assert.match(source, /showCallConsentModal/)
  assert.match(source, /전화번호가 그대로 전달될 수 있어요/)
  assert.match(source, /동행 목적/)
  assert.match(source, /window\.location\.href = `tel:\$\{phone\}`/)
})

test('chat room can copy the room creator payout account', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /copyCreatorPayoutAccount/)
  assert.match(source, /navigator\.clipboard\.writeText/)
  assert.match(source, /복사/)
  assert.match(source, /계좌 정보를 복사했습니다/)
})

test('room creators see a first-room guide and submit a one-line appearance note', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /showHostGuide/)
  assert.match(source, /gatita:room-host-guide:/)
  assert.match(source, /💳/)
  assert.match(source, /🧍/)
  assert.match(source, /🤝/)
  assert.match(source, /📞/)
  assert.match(source, /정산이 필요할 경우 방장이 결제 후 정산해요/)
  assert.match(source, /출발 5분 전부터는 갑자기 방을 나가면 서비스 이용이 정지될 수 있어요/)
  assert.match(source, /방장과 멤버들은 서로 전화번호가 노출될 수 있어요\. 지각, 노쇼, 출발 위치 확인 등 동행 목적에만 사용해주세요\./)
  assert.doesNotMatch(source, /방장과 멤버들은 서로 전화번호가 노출될 수 있어요\.\s*<br \/>/)
  assert.match(source, /chat-guide-sheet/)
  assert.match(source, /chat-guide-card/)
  assert.match(source, /chat-guide-line/)
  assert.doesNotMatch(source, /whitespace-nowrap text-\[9\.5px\] leading-4 tracking-\[-0\.08em\]/)
  assert.doesNotMatch(source, /<p className="text-sm font-black text-gray-950">정산<\/p>/)
  assert.doesNotMatch(source, /<p className="text-sm font-black text-gray-950">약속<\/p>/)
  assert.doesNotMatch(source, /<p className="text-sm font-black text-gray-950">전화번호<\/p>/)
  assert.match(source, /hostAppearance/)
  assert.match(source, /hostAppearanceLoaded/)
  assert.match(source, /hostAppearanceDraft/)
  assert.match(source, /방장 인상착의/)
  assert.match(source, /HOST_APPEARANCE_MESSAGE_PREFIX/)
  assert.match(source, /content: `\$\{HOST_APPEARANCE_MESSAGE_PREFIX\}\$\{hostAppearanceDraft\.trim\(\)\}`/)
  assert.doesNotMatch(source, /content: `방장 인상착의: \$\{hostAppearance/)
})

test('host appearance is hidden from chat and shown in entry guide and participant sheet', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /extractHostAppearanceFromMessage/)
  assert.match(source, /LEGACY_HOST_APPEARANCE_MESSAGE_PREFIX/)
  assert.match(source, /visibleMessageRows/)
  assert.match(source, /!extractHostAppearanceFromMessage\(message\.content\)/)
  assert.match(source, /showRoomGuide/)
  assert.match(source, /gatita:room-entry-guide:/)
  assert.match(source, /방장 인상착의/)
  assert.match(source, /참여 확정하기를 꼭 눌러주세요/)
  assert.match(source, /꼭 도착지까지 가지 않아도/)
  assert.match(source, /출발 5분 전부터는 갑자기 방을 나가면 서비스 이용이 정지될 수 있어요/)
  assert.match(source, /setShowRoomGuide\(true\)/)
  assert.match(source, /if \(hostAppearance\.trim\(\)\) \{/)
  assert.match(source, /participant\.user_id === room\.created_by && hostAppearance/)
})

test('room creator transfer is required before leaving a room with members', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')
  const routePath = 'app/api/rooms/[id]/leave/route.ts'
  const routeSource = readProjectFile(routePath)
  const schema = readProjectFile('supabase_schema.sql')

  assert.match(source, /showHostLeaveModal/)
  assert.match(source, /멤버들과 협의가 완료됐나요\?/)
  assert.match(source, /nextHostId/)
  assert.match(source, /fetch\(`\/api\/rooms\/\$\{roomId\}\/leave`/)
  assert.match(source, /협의 없이 여러 번 탈주하면 서비스 이용이 정지될 수 있습니다/)
  assert.doesNotMatch(source, /if \(!confirm\('정말로 채팅방을 나가시겠습니까\?'\)\) return/)
  assert.match(routeSource, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(routeSource, /auth\.getUser\(\)/)
  assert.match(routeSource, /\.from\('chat_rooms'\)\s*[\s\S]*\.update\(\{ created_by: nextHostId \}\)/)
  assert.match(routeSource, /\.from\('room_participants'\)\s*[\s\S]*\.delete\(\)/)
  assert.match(schema, /Room creators can transfer active rooms to participants/i)
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
  const pageSource = readProjectFile('app/page.tsx')
  const mapSource = readProjectFile('components/CampusRouteMap.tsx')
  const cssSource = readProjectFile('app/globals.css')

  assert.match(mapSource, /gatita-map-stats/)
  assert.match(cssSource, /\.gatita-map-stats/)
  assert.match(pageSource, /mapHeaderRef/)
  assert.match(pageSource, /--map-header-bottom/)
  assert.match(pageSource, /ResizeObserver/)
  assert.match(pageSource, /gatita-standalone-map/)
  assert.match(pageSource, /gatita-browser-map/)
  assert.match(cssSource, /top:\s*calc\(var\(--map-header-bottom/)
  assert.match(cssSource, /html\.gatita-standalone-map \.gatita-map-stats/)
  assert.match(cssSource, /--map-stat-gap:\s*0\.625rem/)
  assert.doesNotMatch(cssSource, /9\.25rem/, 'map stat chips should not be pushed deep below the header')
  assert.match(mapSource, /isRoomJoinable/)
  assert.match(mapSource, /isPastDeparture/)
  assert.match(mapSource, /disabled=\{isFull \|\| isPastDeparture\}/)
})
