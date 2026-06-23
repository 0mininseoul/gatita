import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function loadRoomInviteExports() {
  const source = readProjectFile('lib/roomInvite.ts')
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

test('room invite utility builds a private-safe share payload', () => {
  assert.equal(existsSync(join(process.cwd(), 'lib/roomInvite.ts')), true)
  const { buildRoomInviteUrl, buildRoomInviteSharePayload } = loadRoomInviteExports()

  const url = buildRoomInviteUrl('https://gatita.kro.kr/map', 'room-123')
  assert.equal(url, 'https://gatita.kro.kr/rooms/room-123?invite=1')

  const payload = buildRoomInviteSharePayload({
    origin: 'https://gatita.kro.kr',
    roomId: 'room-123',
    fromLabel: '가천대역 1번출구',
    toLabel: 'AI공학관',
    departureDate: '2026-06-22',
    departureTime: '18:30:00',
    participantCount: 2,
    maxParticipants: 4,
  })

  assert.equal(payload.title, '같이타 초대')
  assert.equal(payload.url, 'https://gatita.kro.kr/rooms/room-123?invite=1')
  assert.match(payload.text, /\[같이타\] 6월 22일 18:30/)
  assert.match(payload.text, /가천대역 1번출구 → AI공학관 같이 갈 사람\?/)
  assert.match(payload.text, /현재 2\/4명 참여 중/)
  assert.doesNotMatch(payload.text, /전화|계좌|채팅/)
})

test('chat room exposes invite sharing from the participant sheet only for joinable rooms', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')

  assert.match(source, /Share2/)
  assert.match(source, /buildRoomInviteSharePayload/)
  assert.match(source, /const isRoomInviteAvailable =/)
  assert.match(source, /handleShareRoomInvite/)
  assert.match(source, /navigator\.share/)
  assert.match(source, /navigator\.clipboard\.writeText\(sharePayload\.text\)/)
  assert.match(source, /초대 링크 공유/)
  assert.match(source, /방이 마감되면 초대할 수 없어요/)
  assert.doesNotMatch(source, /방 만들고 공유/)
})

test('invited non-participants can join from the room page without seeing private room data', () => {
  const source = readProjectFile('app/rooms/[id]/page.tsx')
  const joinStart = source.indexOf('const handleJoinInvitedRoom = useCallback')
  const joinEnd = source.indexOf('\n  }, [\n    broadcastRoomSync', joinStart)
  const joinBlock = source.slice(joinStart, joinEnd)

  assert.match(source, /useSearchParams/)
  assert.match(source, /const isInviteEntry = searchParams\.get\('invite'\) === '1'/)
  assert.match(source, /handleJoinInvitedRoom/)
  assert.match(source, /source: 'room_invite'/)
  assert.ok(joinStart > -1, 'invite join handler exists')
  assert.ok(joinEnd > joinStart, 'invite join handler block can be inspected')
  assert.match(joinBlock, /loadMessages\(\),/)
  assert.match(source, /router\.push\(`\/\?redirect=\$\{encodeURIComponent\(`\/rooms\/\$\{roomId\}\?invite=1`\)\}`\)/)
  assert.match(source, /초대받은 방/)
  assert.match(source, /참여하고 채팅 보기/)
  assert.match(source, /이 방은 마감됐어요/)
  assert.match(source, /\{isParticipant \? \(/)
  assert.match(source, /채팅방에 참여하면 메시지를 볼 수 있습니다/)
  assert.doesNotMatch(source, /\{creatorPayoutAccount \? \([\s\S]*\) : \(/, 'payout panel should not render for non-participants')
})

test('OAuth start preserves a room invite return path', () => {
  const auth = readProjectFile('lib/auth.ts')
  const page = readProjectFile('components/HomeClient.tsx')
  const callback = readProjectFile('app/auth/callback/route.ts')

  assert.match(auth, /getGoogleOAuthOptions\(redirectPath\?: string\)/)
  assert.match(auth, /redirectTo: `\$\{window\.location\.origin\}\/auth\/callback\$\{callbackSearch\}`/)
  assert.match(page, /const inviteRedirectPath = pathname\.startsWith\('\/rooms\/'\)/)
  assert.match(page, /getGoogleOAuthOptions\(inviteRedirectPath\)/)
  assert.match(callback, /const redirectPath = requestUrl\.searchParams\.get\('redirect'\)/)
  assert.match(callback, /const destinationPath = isSafeRedirectPath && redirectPath \? redirectPath : '\/'/)
  assert.match(callback, /redirectToHome\(origin, \{ auth: 'complete' \}, redirectPath\)/)
})
