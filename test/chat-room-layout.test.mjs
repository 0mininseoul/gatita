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
  assert.match(source, /--chat-viewport-height/)
  assert.match(source, /hostAppearanceInputRef/)
  assert.match(source, /scrollHostAppearanceInputIntoView/)
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
  const guideSheetBlock = cssBlock(source, '.chat-guide-sheet')

  assert.match(shellBlock, /height:\s*100%;/)
  assert.doesNotMatch(shellBlock, /height:\s*100dvh;/)
  assert.match(headerBlock, /top:\s*0;/)
  assert.match(messagesBlock, /padding-top:\s*calc\(var\(--chat-header-height\) \+ 0\.75rem\);/)
  assert.match(messagesBlock, /bottom:\s*calc\(var\(--chat-composer-height\) \+ var\(--chat-keyboard-inset\)\);/)
  assert.match(messagesBlock, /padding-bottom:\s*0\.75rem;/)
  assert.doesNotMatch(messagesBlock, /padding-bottom:[^;]*--chat-keyboard-inset/)
  assert.match(composerBlock, /bottom:\s*var\(--chat-keyboard-inset\);/)
  assert.match(composerBlock, /padding-bottom:\s*max\(0\.5rem, calc\(env\(safe-area-inset-bottom\) \* 0\.38\)\);/)
  assert.match(guideSheetBlock, /max-height:\s*min\(calc\(var\(--chat-viewport-height\) - 1\.25rem\), 42rem\);/, 'guide sheets should shrink to the iOS visual viewport when the keyboard is open')
  assert.match(guideSheetBlock, /overflow-y:\s*auto;/, 'guide sheets should scroll internally when the keyboard covers content')
  assert.match(guideSheetBlock, /overscroll-behavior:\s*contain;/)
})

test('chat bubbles use compact mobile messenger spacing', () => {
  const source = readProjectFile('app/globals.css')
  const block = cssBlock(source, '.chat-message')

  assert.match(block, /padding:\s*0\.45rem 0\.7rem;/)
  assert.match(block, /border-radius:\s*0\.875rem;/)
  assert.match(block, /line-height:\s*1\.35;/)
  assert.match(block, /width:\s*fit-content;/, 'both own and other bubbles should shrink to message length')
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
  const loadEnd = source.indexOf('\n  // 실시간으로 도착한 단일 메시지', loadStart)
  const loadBlock = source.slice(loadStart, loadEnd)
  const ensureStart = source.indexOf('const ensureAuthors = useCallback')
  const ensureEnd = source.indexOf('\n  const loadMessages', ensureStart)
  const ensureBlock = source.slice(ensureStart, ensureEnd)

  assert.ok(loadStart > -1, 'loadMessages exists')
  assert.ok(loadEnd > loadStart, 'loadMessages block can be inspected')
  // 메시지는 본문만 조회하고 작성자는 별도 경로로 채운다 (embedded join 미사용)
  assert.match(loadBlock, /\.select\('id, room_id, user_id, content, created_at'\)/)
  assert.match(loadBlock, /splitMessages/)
  assert.match(loadBlock, /ensureAuthors\(/)
  assert.match(loadBlock, /authorsCacheRef\.current\.get\(message\.user_id\)/)
  assert.doesNotMatch(loadBlock, /user:users\(nickname, department\)/)
  // 작성자 조회는 캐시에 없는 id만 별도 쿼리하므로 실패해도 메시지는 표시된다
  assert.ok(ensureStart > -1, 'ensureAuthors exists')
  assert.match(ensureBlock, /\.from\('users'\)/)
  assert.match(ensureBlock, /\.in\('id', missing\)/)
})

test('chat message author labels are shown only at the start of consecutive user groups', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /messages\.map\(\(message, index\) =>/)
  assert.match(source, /previousMessage = messages\[index - 1\]/)
  assert.match(source, /nextMessage = messages\[index \+ 1\]/)
  assert.match(source, /startsMessageGroup = showDateDivider \|\| !previousMessage \|\| previousMessage\.user_id !== message\.user_id/)
  assert.match(source, /!isOwnMessage && startsMessageGroup &&/)
  assert.match(source, /chat-message-author/)
  assert.match(source, /is-same-author/)
})

test('chat guide modals use aligned compact checklist rows', () => {
  const css = readProjectFile('app/globals.css')
  const page = readProjectFile('app/rooms/[id]/page.tsx')
  const guideLineBlock = cssBlock(css, '.chat-guide-line')
  const guideIconBlock = cssBlock(css, '.chat-guide-icon')

  assert.match(css, /\.chat-guide-sheet/)
  assert.match(css, /\.chat-guide-card/)
  assert.match(css, /\.chat-guide-icon/)
  assert.match(guideLineBlock, /grid-template-columns:\s*1\.15rem minmax\(0, 1fr\);/)
  assert.match(guideLineBlock, /align-items:\s*center;/, 'guide row icon and text should be vertically centered')
  assert.match(guideLineBlock, /letter-spacing:\s*0;/)
  assert.match(guideLineBlock, /font-size:\s*clamp\(0\.64rem, 2\.42vw, 0\.72rem\);/)
  assert.match(guideLineBlock, /line-height:\s*1\.44;/)
  assert.match(guideIconBlock, /width:\s*1\.15rem;/, 'guide icon column should be compact enough to give text more room')
  assert.match(guideIconBlock, /align-items:\s*center;/)
  assert.match(page, /동행 전 체크/)
  assert.match(page, /출발 전 체크/)
  assert.match(page, /참여할 수 있어요\.<br \/> 중간에/)
  assert.match(page, /노출될 수 있어요\.<br \/> 지각/)
  assert.doesNotMatch(page, /tracking-\[-0\.08em\]/)
})

test('chat room hides participant chips behind a participant sheet and shows creator payout account', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.doesNotMatch(source, /participant\.confirmed \? 'bg-green-100/, 'participant chips should not be publicly rendered inline')
  assert.doesNotMatch(source, /absolute -right-0\.5 -top-0\.5/, 'participant header action should not show a numeric badge')
  assert.match(source, /showParticipants/, 'participants should be shown from an explicit header action')
  assert.match(source, /참여자/, 'chat header should include participant list affordance')
  assert.match(source, /handleCallParticipant/, 'participant list should allow guarded phone calls')
  assert.match(source, /user:users\(nickname, department, avatar_url\)/, 'participant query should include public profile photos')
  assert.match(source, /participant\.user\?\.avatar_url/, 'participant sheet should render profile photos')
  assert.match(source, /preloadedParticipantAvatarUrlsRef/, 'participant avatar URLs should be tracked for background preload')
  assert.match(source, /new window\.Image\(\)/, 'participant avatars should preload before the sheet is opened')
  assert.match(source, /image\.src = avatarUrl/, 'participant avatar preload should request the same URL rendered in the sheet')
  assert.match(source, /className="h-full w-full object-cover"/, 'participant profile photos should be cropped as circular avatars')
  assert.doesNotMatch(source, /href=\{`tel:\$\{participant\.user\?\.phone\}`\}/, 'participant sheet should not expose direct tel links before consent')
  assert.match(source, /\/api\/rooms\/\$\{roomId\}\/private/, 'phone numbers and creator payout account should load through a room-scoped server API')
  assert.doesNotMatch(source, /user:users\(nickname, department, phone\)/, 'participant query must not expose phone numbers through public profile joins')
  assert.doesNotMatch(source, /\.from\('user_payout_accounts'\)/, 'chat room must not read creator payout accounts directly from the browser')
  assert.match(source, /방장 계좌/, 'creator payout account should replace the old participant chip area')
  assert.match(source, /account_number/, 'creator payout account should display the account number')
  assert.match(source, /formatAccountNumberForBank/, 'creator payout account should be formatted with bank-specific separators')
  assert.match(source, /chat-payout-account/, 'creator payout account should suppress browser auto underline')
  assert.match(source, /const isCurrentUserParticipant = participant\.user_id === user\?\.id/, 'participant sheet should identify the signed-in user')
  assert.match(source, /\(나\) \$\{participant\.user\?\.nickname/, 'participant sheet should prefix the signed-in user nickname')
  assert.match(source, /isCurrentUserParticipant[\s\S]*bg-primary-50/, 'signed-in user participant card should use a distinct background')
  assert.match(source, />확정</, 'non-host confirmed participants should show a compact confirmed badge')
  assert.doesNotMatch(source, /<Check className="h-3\.5 w-3\.5 shrink-0 text-green-600" \/>/)
})

test('chat room folds phone privacy guidance into the entry guide and confirms before dialing', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.doesNotMatch(source, /showPhonePrivacyNotice/)
  assert.doesNotMatch(source, /phonePrivacyNoticeStorageKey/)
  assert.doesNotMatch(source, /gatita:room-phone-privacy-notice:/)
  assert.doesNotMatch(source, /안전번호/)
  assert.match(source, /방장과 멤버들은 서로 전화번호가 노출될 수 있어요\./)
  assert.match(source, /지각, 노쇼, 출발 위치 확인 등 동행 목적에만 사용해주세요\./)
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
  assert.match(source, /formattedCreatorAccountNumber/)
  assert.match(source, /복사/)
  assert.match(source, /계좌 정보를 복사했습니다/)
})

test('chat room realtime subscriptions reload messages and participant membership changes', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')
  const mapPage = readProjectFile('app/page.tsx')
  const schema = readProjectFile('supabase_schema.sql')

  assert.match(source, /const handleParticipantsRefresh = useCallback/)
  assert.match(source, /const applyIncomingMessage = useCallback/)
  assert.match(source, /roomSyncChannelRef/)
  assert.match(source, /const broadcastRoomSync = useCallback/)
  assert.match(source, /\.channel\(`room-sync:\$\{roomId\}`\)/)
  assert.match(source, /\.on\('broadcast', \{ event: 'room-sync' \}, handleParticipantsRefresh\)/)
  // 메시지는 전체 재조회/브로드캐스트가 아니라 증분 반영한다
  assert.match(source, /void applyIncomingMessage\(payload\.new as Message\)/)
  assert.doesNotMatch(source, /broadcastRoomSync\('message'\)/)
  assert.match(source, /broadcastRoomSync\('participants'\)/)
  assert.match(source, /postgres_changes/)
  assert.match(source, /table: 'messages'/)
  assert.match(source, /table: 'room_participants'/)
  assert.match(source, /event: 'DELETE'[\s\S]*table: 'room_participants'/, 'participant leaves should reload even though DELETE filters are not reliable')
  assert.match(source, /loadParticipants\(\)/)
  assert.match(source, /checkParticipation\(user\.id\)/)
  assert.doesNotMatch(source, /if \(payload\.new\.user_id !== user\?\.id\)/, 'remote message refresh should not depend on sender id')
  assert.match(schema, /alter publication supabase_realtime/i)
  assert.match(schema, /'messages'/)
  assert.match(schema, /'room_participants'/)
  assert.match(schema, /replica identity full/i)
  assert.match(mapPage, /const broadcastRoomSync = useCallback/)
  assert.match(mapPage, /\.channel\(`room-sync:\$\{targetRoomId\}`\)/)
  assert.match(mapPage, /broadcastRoomSync\(roomId, 'participants'\)/)
})

test('confirming participation is guarded against duplicate toasts', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')
  const route = readProjectFile('app/api/rooms/[id]/confirm/route.ts')

  assert.match(source, /isConfirmingParticipation/)
  assert.match(source, /if \(!user \|\| isConfirmed \|\| isConfirmingParticipation\) return/)
  assert.match(source, /fetch\(`\/api\/rooms\/\$\{roomId\}\/confirm`,\s*\{\s*method:\s*'POST'/)
  assert.doesNotMatch(source, /\.from\('room_participants'\)[\s\S]*\.update\(\{ confirmed: true \}\)/)
  assert.match(source, /toast\.success\('참여 확정되었습니다', \{ id: 'confirm-participation' \}\)/)
  assert.match(source, /disabled=\{isConfirmingParticipation\}/)
  assert.match(route, /createAdminSupabase/)
  assert.match(route, /auth\.getUser\(\)/)
  assert.match(route, /\.from\('room_participants'\)[\s\S]*\.update\(\{ confirmed: true \}\)/)
})

test('room creators submit a one-line host appearance note from the chat watermark', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /hostAppearance/)
  assert.match(source, /hostAppearanceLoaded/)
  assert.match(source, /hostAppearanceDraft/)
  assert.match(source, /chat-host-watermark__appearance-label/)
  assert.match(source, /chat-host-watermark__input/)
  assert.match(source, /ref=\{hostAppearanceInputRef\}/)
  assert.match(source, /onFocus=\{scrollHostAppearanceInputIntoView\}/)
  assert.match(source, /인상착의 한 줄/)
  assert.match(source, /placeholder="예: 검은 백팩, 파란 후드"/)
  assert.match(source, /HOST_APPEARANCE_MESSAGE_PREFIX/)
  assert.match(source, /content: `\$\{HOST_APPEARANCE_MESSAGE_PREFIX\}\$\{hostAppearanceDraft\.trim\(\)\}`/)
  assert.doesNotMatch(source, /content: `방장 인상착의: \$\{hostAppearance/)
})

test('chat send button submits on touch pointerdown while the keyboard is open', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /const handleSendMessage = useCallback\(async \(\) =>/)
  assert.match(source, /handleSendButtonPointerDown/)
  assert.match(source, /event\.pointerType !== 'touch'/)
  assert.match(source, /event\.preventDefault\(\)/)
  assert.match(source, /void handleSendMessage\(\)/)
  assert.match(source, /onPointerDown=\{handleSendButtonPointerDown\}/)
})

test('host appearance is hidden from chat and shown in entry guide and participant sheet', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /extractHostAppearanceFromMessage/)
  // host-appearance 분리 로직은 lib/chat/messages.ts 로 이동했고, 페이지는 splitMessages 로 화면 메시지를 분리한다
  assert.match(source, /splitMessages/)
  const messageHelpers = readProjectFile('lib/chat/messages.ts')
  assert.match(messageHelpers, /LEGACY_HOST_APPEARANCE_MESSAGE_PREFIX/)
  assert.match(messageHelpers, /function splitMessages/)
  assert.match(messageHelpers, /if \(appearance\) \{/)
  assert.match(source, /showRoomGuide/)
  assert.match(source, /gatita:room-entry-guide:/)
  assert.match(source, /방장 인상착의/)
  assert.match(source, /참여 확정하기를 꼭 눌러주세요/)
  assert.match(source, /꼭 도착지까지 가지 않아도/)
  assert.match(source, /출발 5분 전부터는 갑자기 방을 나가면 서비스 이용이 정지될 수 있어요/)
  assert.match(source, /setShowRoomGuide\(true\)/)
  assert.match(source, /\{hostAppearance && \(/)
  assert.doesNotMatch(source, /방장이 아직 인상착의를 입력하지 않았습니다\./)
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
  assert.match(routeSource, /createAdminSupabase/)
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
  assert.match(pageSource, /--map-viewport-height/)
  assert.match(pageSource, /window\.visualViewport\?\.height \?\? window\.innerHeight/)
  assert.match(pageSource, /Math\.max\(visualHeight, window\.innerHeight, document\.documentElement\.clientHeight\)/, 'map canvas should fill the larger layout viewport in mobile Safari')
  assert.match(pageSource, /style=\{\{ height: 'var\(--map-viewport-height\)' \}\}/, 'map canvas should use full-screen map height instead of the smaller visual viewport')
  assert.match(pageSource, /resetDocumentScrollPosition/)
  assert.match(pageSource, /className="fixed inset-x-0 top-0 z-\[\d+\][^"]*items-end[\s\S]*style=\{\{ height: 'var\(--app-viewport-height\)' \}\}/, 'map overlays should anchor to the visual viewport instead of a shifted map container')
  assert.match(mapSource, /className="gatita-bottom-sheet/)
  assert.match(mapSource, /className="gatita-bottom-sheet-body/)
  assert.match(
    mapSource,
    /aria-label="선택 닫기"[\s\S]*onPointerDown=\{handleCloseSheetPointerDown\}[\s\S]*className="absolute right-1\.5 top-1\.5 z-10 inline-flex h-12 w-12 touch-manipulation/,
    'close button must fire on touch pointerdown and expose a comfortable (>=44px) touch target near the top-right corner',
  )
  // iOS: acting on pointerdown for touch avoids the momentum-scroll body swallowing the first click.
  assert.match(
    mapSource,
    /handleCloseSheetPointerDown = useCallback\(\(event: ReactPointerEvent<HTMLButtonElement>\) => \{\s*if \(event\.pointerType !== 'touch'\) return\s*event\.preventDefault\(\)\s*closeSheet\(\)/,
    'close button pointerdown handler should preventDefault and close on the first touch',
  )
  assert.match(mapSource, /gatita-bottom-sheet-body">\s*<div className="pr-14"/, 'sheet body should clear the enlarged close button')
  // The bottom sheet is positioned via the .gatita-bottom-sheet CSS block (asserted below),
  // not Tailwind bottom-3; a decorative pointer-events-none overlay may still use bottom-3.
  assert.match(sheetBlock, /max-height:\s*min\(72vh, calc\(var\(--app-viewport-height\) - 8\.75rem\)\);/)
  assert.match(sheetBlock, /bottom:\s*max\(1rem, env\(safe-area-inset-bottom\)\);/)
  assert.doesNotMatch(sheetBlock, /padding-right:\s*2rem;/, 'bottom sheet body should not create extra right whitespace')
})

test('chat room editable inputs avoid iOS Safari focus zoom', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')
  const cssSource = readProjectFile('app/globals.css')

  assert.match(source, /id="host-appearance"[\s\S]*className="chat-host-watermark__input"/, 'host appearance input should use the watermark input class')
  assert.match(cssSource, /\.chat-host-watermark__input\s*\{[^}]*font-size:\s*1rem/, 'host appearance input should use at least 16px text to avoid iOS zoom')
  assert.match(source, /placeholder="메시지를 입력하세요\.\.\."[\s\S]*className="[^"]*text-base[^"]*"/, 'message composer input should use at least 16px text')
  assert.match(source, /value=\{nextHostId\}[\s\S]*className="input-field text-base font-bold"/, 'host transfer select should use at least 16px text')
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
