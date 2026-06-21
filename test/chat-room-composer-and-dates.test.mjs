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

test('sending a message keeps the composer input focused so the keyboard stays open', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  // 입력창에 ref가 연결되어 전송 후 다시 포커스를 줄 수 있어야 한다
  assert.match(source, /const composerInputRef = useRef<HTMLInputElement>\(null\)/)
  assert.match(source, /ref=\{composerInputRef\}/)
  assert.match(source, /composerInputRef\.current\?\.focus\(\{ preventScroll: true \}\)/)

  // 터치 전송 경로: 포커스 탈취 방지 + 전송 + 입력창 포커스 유지
  assert.match(source, /event\.preventDefault\(\)\s*\n\s*void handleSendMessage\(\)\s*\n\s*focusComposerInput\(\)/)

  // 클릭(데스크톱·폴백) 경로도 전송 후 입력창 포커스를 유지한다
  assert.match(source, /const handleSendButtonClick = useCallback\(\(\) => \{[\s\S]*?focusComposerInput\(\)/)
  assert.match(source, /onClick=\{handleSendButtonClick\}/)
})

test('send button blocks composer blur even where synthetic touch events are passive (iOS)', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  // 전송 버튼에 ref 연결
  assert.match(source, /const composerSendButtonRef = useRef<HTMLButtonElement>\(null\)/)
  assert.match(source, /ref=\{composerSendButtonRef\}/)

  // React 합성 touchstart는 passive라 막을 수 없으므로 네이티브 비-passive 리스너로 preventDefault
  assert.match(source, /addEventListener\('touchstart', preventComposerBlur, \{ passive: false \}\)/)
  assert.match(source, /const preventComposerBlur = \(event: TouchEvent\) => \{\s*\n\s*event\.preventDefault\(\)/)
  assert.match(source, /removeEventListener\('touchstart', preventComposerBlur\)/)

  // 데스크톱 마우스도 버튼이 포커스를 빼앗지 않도록 mousedown 차단
  assert.match(source, /onMouseDown=\{handleSendButtonMouseDown\}/)
  assert.match(source, /const handleSendButtonMouseDown = useCallback\(\(event: ReactMouseEvent<HTMLButtonElement>\) => \{\s*\n\s*event\.preventDefault\(\)/)
})

test('chat messages render a KakaoTalk-style date divider when the day changes', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /import \{ format, isSameDay \} from 'date-fns'/)
  // 이전 메시지와 날짜가 다르거나 첫 메시지면 날짜 구분선을 표시
  assert.match(source, /const showDateDivider = !previousMessage \|\| !isSameDay\(new Date\(previousMessage\.created_at\), messageDate\)/)
  assert.match(source, /\{showDateDivider && \(/)
  assert.match(source, /className="chat-date-divider"/)
  assert.match(source, /format\(messageDate, 'yyyy년 M월 d일 EEEE', \{ locale: ko \}\)/)
  // 날짜가 바뀌면 같은 작성자라도 새 그룹으로 시작/종료되어야 한다
  assert.match(source, /const startsMessageGroup = showDateDivider \|\| !previousMessage \|\| previousMessage\.user_id !== message\.user_id/)
  assert.match(source, /const endsMessageGroup = nextStartsNewDay \|\| !nextMessage \|\| nextMessage\.user_id !== message\.user_id/)
})

test('date divider CSS centers a subtle pill label', () => {
  const source = readProjectFile('app/globals.css')
  const dividerBlock = cssBlock(source, '.chat-date-divider')
  const labelBlock = cssBlock(source, '.chat-date-divider span')

  assert.match(dividerBlock, /display:\s*flex;/)
  assert.match(dividerBlock, /justify-content:\s*center;/)
  assert.match(labelBlock, /border-radius:\s*9999px;/)
  assert.match(labelBlock, /background:\s*rgba\(31, 41, 55, 0\.06\);/)
})
