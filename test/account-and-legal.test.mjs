import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const DELETE_CONFIRMATION_TEXT = '떠나지 말아주세요. 탈퇴하시는 이유를 여쭤봐도 될까요? 열심히 만들었어요 흑흑'

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test('settings exposes a low-emphasis but deliberate account deletion flow', () => {
  const source = readProjectFile('app/settings/page.tsx')

  assert.match(source, /deleteStep/)
  assert.match(source, /탈퇴하기/)
  assert.match(source, new RegExp(DELETE_CONFIRMATION_TEXT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(source, /fetch\('\/api\/account\/delete'/)
  assert.match(source, /deleteConfirmText\.trim\(\) === DELETE_CONFIRMATION_TEXT/)
})

test('settings contact card opens the user mail app without rendering the admin email', () => {
  const source = readProjectFile('app/settings/page.tsx')

  assert.match(source, /ADMIN_CONTACT_EMAIL/)
  assert.match(source, /createMailHref/)
  assert.match(source, /mailto:\$\{ADMIN_CONTACT_EMAIL\}/)
  assert.match(source, /문의하기/)
  assert.match(source, /버그 제보/)
  assert.doesNotMatch(source, /문의 유형을 선택하면 기본 메일 앱이 열립니다\./)
  assert.doesNotMatch(source, /ym5373@gachon\.ac\.kr 로 메일 주세요/)
})

test('settings lets users register a profile photo from a storage-backed public avatar URL', () => {
  const source = readProjectFile('app/settings/page.tsx')
  const types = readProjectFile('lib/supabase.ts')
  const schema = readProjectFile('supabase_schema.sql')
  const migration = readProjectFile('supabase/migrations/20260619224027_add_profile_photos.sql')
  const profileRoute = readProjectFile('app/api/profile/me/route.ts')

  assert.match(source, /PROFILE_PHOTO_BUCKET/)
  assert.match(source, /profile-photos/)
  assert.match(source, /handleProfilePhotoChange/)
  assert.match(source, /PROFILE_PHOTO_UPLOAD_MAX_BYTES = 10 \* 1024 \* 1024/, 'profile photo picker should accept images up to 10MB')
  assert.match(source, /PROFILE_PHOTO_STORAGE_MAX_BYTES = 2 \* 1024 \* 1024/, 'profile photos should still be stored under 2MB')
  assert.match(source, /compressProfilePhoto/, 'profile photos should be compressed before upload')
  assert.match(source, /URL\.createObjectURL\(file\)/, 'selected photos should be previewed immediately')
  assert.match(source, /canvas\.toBlob/, 'compression should use browser canvas encoding')
  assert.match(source, /compressedProfilePhoto\.file/, 'storage upload should use the compressed file')
  assert.match(source, /\.storage\.from\(PROFILE_PHOTO_BUCKET\)\.upload/)
  assert.match(source, /getPublicUrl/)
  assert.match(source, /\.from\('users'\)[\s\S]*\.update\(\{\s*avatar_url: nextAvatarUrl/)
  assert.match(source, /프로필 사진 등록|사진 변경/)
  assert.match(types, /avatar_url\?: string \| null/)
  assert.match(profileRoute, /id, nickname, nickname_updated_at, department, avatar_url, created_at, updated_at/)
  assert.match(schema, /avatar_url text/)
  assert.match(schema, /profile-photos/)
  assert.match(migration, /storage\.buckets/)
  assert.match(migration, /storage\.objects/)
  assert.match(migration, /Users can upload own profile photo/)
  assert.match(migration, /Users can update own profile photo/)
  assert.match(migration, /Users can delete own profile photo/)
})

test('settings back action returns to the authenticated map', () => {
  const source = readProjectFile('app/settings/page.tsx')

  assert.match(source, /router\.push\('\/map'\)/)
  assert.doesNotMatch(source, /onClick=\{\(\) => router\.back\(\)\}/)
})

test('settings header clears the iOS PWA status bar safe area', () => {
  const source = readProjectFile('app/settings/page.tsx')

  assert.match(source, /<header\s+className="app-header px-4 pb-4"/)
  assert.match(source, /paddingTop:\s*'max\(1rem, env\(safe-area-inset-top\)\)'/)
  assert.doesNotMatch(source, /<header\s+className="app-header px-4 py-4"/)
})

test('settings uses a compact row-based product layout', () => {
  const source = readProjectFile('app/settings/page.tsx')
  const css = readProjectFile('app/globals.css')

  assert.match(source, /settings-shell/)
  assert.match(source, /settings-hero/)
  assert.match(source, /settings-section/)
  assert.match(source, /settings-list/)
  assert.match(source, /settings-row/)
  assert.match(source, /settings-avatar-button/)
  assert.match(source, /settings-action-row/)
  assert.match(source, /프로필 요약/)
  assert.match(source, /기본 정보/)
  assert.match(source, /정산 계좌/)
  assert.doesNotMatch(source, /className="card p-6 mb-6"/, 'settings should not stack oversized generic cards')
  assert.match(css, /\.settings-shell/)
  assert.match(css, /\.settings-hero/)
  assert.match(css, /\.settings-section/)
  assert.match(css, /\.settings-row/)
  assert.match(css, /\.settings-avatar-button/)
})

test('account deletion API verifies the session and deletes the auth user with the service role key', () => {
  const routePath = 'app/api/account/delete/route.ts'

  assert.equal(existsSync(join(process.cwd(), routePath)), true)

  const source = readProjectFile(routePath)
  assert.match(source, /createAdminSupabase/)
  assert.match(source, /confirmation !== DELETE_CONFIRMATION_TEXT/)
  assert.match(source, new RegExp(DELETE_CONFIRMATION_TEXT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(source, /auth\.getUser\(\)/)
  assert.match(source, /auth\.admin\.deleteUser\(user\.id\)/)
})

test('public legal and metadata copy do not expose the owner real name', () => {
  const files = [
    'app/privacy/page.tsx',
    'app/terms/page.tsx',
    'app/layout.tsx',
  ]

  files.forEach((file) => {
    assert.doesNotMatch(readProjectFile(file), /박영민/, `${file} should not expose a real name`)
  })
})

test('privacy policy discloses participant phone, payout account, map SDK, and app-based contact', () => {
  const source = readProjectFile('app/privacy/page.tsx')

  assert.match(source, /휴대전화번호는 지각, 노쇼, 출발 위치 확인 등 동행 목적/)
  assert.match(source, /계좌정보는 방장이 정산을 진행할 수 있도록/)
  assert.match(source, /\['Kakao', '캠퍼스 지도 표시를 위한 지도 SDK 제공'/)
  assert.match(source, /관리자 화면 접근 권한 확인 및 서버 측 권한 검증/)
  assert.match(source, /설정 화면의 문의하기 또는 버그 제보 버튼/)
  assert.doesNotMatch(source, /ym5373@gachon\.ac\.kr/)
})

test('app opts out of browser dark-mode recoloring and keeps a light scheme', () => {
  const layout = readProjectFile('app/layout.tsx')
  const css = readProjectFile('app/globals.css')

  assert.match(layout, /'color-scheme': 'only light'/)
  assert.match(layout, /'supported-color-schemes': 'light'/)
  assert.match(layout, /style=\{\{ colorScheme: 'only light' \}\}/)
  assert.match(layout, /themeColor:\s*'#ffffff'/)
  assert.match(layout, /duration:\s*800/, 'top toasts should dismiss one second faster than the previous 1800ms default')
  assert.match(layout, /containerStyle=\{\{[\s\S]*top:\s*'max\(1rem, calc\(env\(safe-area-inset-top\) \+ 0\.875rem\)\)'/, 'top toasts should sit below the PWA safe area')
  assert.match(css, /:root\s*\{[\s\S]*color-scheme:\s*only light;/)
  assert.match(css, /html\s*\{[\s\S]*color-scheme:\s*only light;/)
  assert.match(css, /body\s*\{[\s\S]*color-scheme:\s*only light;/)
  assert.match(css, /input,\s*\n\s*textarea,\s*\n\s*select,\s*\n\s*button\s*\{[\s\S]*color-scheme:\s*only light;/)
  assert.doesNotMatch(css, /color-scheme:\s*light only;/)
})

test('admin dashboard is server-authorized and exposes operational review tools', () => {
  const page = readProjectFile('app/admin/page.tsx')
  const route = readProjectFile('app/api/admin/dashboard/route.ts')
  const monitorPage = readProjectFile('app/admin/rooms/[id]/page.tsx')

  assert.match(route, /createAdminSupabase/)
  assert.match(route, /auth\.getUser\(\)/)
  assert.match(route, /privateProfile\?\.is_admin/)
  assert.match(route, /privateProfile\.status !== 'active'/)
  assert.match(route, /user_private_profiles/)
  assert.match(route, /attachPrivateEmail/)
  assert.match(route, /type:\s*'user-status'/)
  assert.match(route, /type:\s*'report-status'/)
  assert.match(route, /type:\s*'moderation-action'/)
  assert.match(route, /type:\s*'report-resolution'/)
  assert.match(route, /resolution_action/)
  assert.match(route, /acknowledged_at/)
  assert.match(route, /user_moderation_actions/)
  assert.match(route, /suspend_7d/)
  assert.match(route, /suspend_30d/)
  assert.match(route, /suspend_permanent/)
  assert.match(route, /release/)
  assert.match(route, /\.from\('reports'\)/)
  assert.match(route, /\.from\('chat_rooms'\)/)
  assert.match(route, /\.from\('messages'\)/)
  assert.match(route, /\.from\('user_payout_accounts'\)/)
  assert.match(route, /room:room_id\(title, from_location, to_location, departure_date, departure_time\)/)
  assert.match(route, /creatorPayoutAccount/)
  assert.match(page, /\/api\/admin\/dashboard/)
  assert.match(page, /관리자 대시보드/)
  assert.match(page, /formatAdminRoomTitle/)
  assert.match(page, /formatAdminDate\(room\.departure_date\)/)
  assert.match(page, /room\.departure_time\.slice\(0, 5\)/)
  assert.match(page, /LOCATIONS\[room\.from_location\]/)
  assert.match(page, /roomDateFilter/)
  assert.match(page, /type="date"/)
  assert.match(page, /roomsByDeparture/)
  assert.match(page, /departure_date.*departure_time/s)
  assert.match(page, /filteredRooms/)
  assert.match(page, /MODERATION_ACTIONS/)
  assert.match(page, /REPORT_RESOLUTION_ACTIONS/)
  assert.match(page, /경고/)
  assert.match(page, /7일 정지/)
  assert.match(page, /30일 정지/)
  assert.match(page, /영구 정지/)
  assert.match(page, /해제/)
  assert.match(page, /조치 안함/)
  assert.match(page, /신고 처리 선택/)
  assert.match(page, /최종 처리/)
  assert.match(page, /정지 사용자/)
  assert.match(page, /운영 조치 로그/)
  assert.match(page, /경고 전송/)
  assert.match(page, /setAdminAccessError/)
  assert.match(page, /관리자 접근 권한을 확인해주세요/)
  assert.match(page, /사용자 관리/)
  assert.match(page, /메시지 조회/)
  assert.match(page, /대기 신고/)
  assert.match(page, /router\.push\(`\/admin\/rooms\/\$\{room\.id\}`\)/)
  assert.match(page, /채팅방 UI로 모니터링/)
  assert.match(page, /실제 채팅방 UI로 보기/)
  assert.match(monitorPage, /\/api\/admin\/dashboard\?roomId=/)
  assert.match(monitorPage, /chat-shell/)
  assert.match(monitorPage, /chat-room-header/)
  assert.match(monitorPage, /chat-messages/)
  assert.match(monitorPage, /chat-composer/)
  assert.match(monitorPage, /관리자 모니터링/)
  assert.match(monitorPage, /setAdminAccessError/)
  assert.match(monitorPage, /관리자 접근 권한을 확인하지 못했습니다/)
  assert.match(monitorPage, /메시지 전송은 비활성화/)
  assert.match(monitorPage, /setInterval\(\(\) => loadMonitor\(true\), 5000\)/)
  assert.doesNotMatch(monitorPage, /\.from\('messages'\)/, 'admin monitor should use the server-authorized dashboard API, not client RLS')
})

test('admin moderation schema stores action history and timed suspensions', () => {
  const schema = readProjectFile('supabase_schema.sql')
  const migration = readProjectFile('supabase/migrations/20260619203257_split_private_user_profiles.sql')
  const joinRoute = readProjectFile('app/api/rooms/[id]/join/route.ts')

  assert.match(schema, /suspended_until timestamp with time zone/)
  assert.match(schema, /suspension_reason text/)
  assert.match(schema, /moderation_updated_at timestamp with time zone/)
  assert.match(schema, /create table (if not exists )?public\.user_moderation_actions/)
  assert.match(schema, /action in \('warning', 'suspend_7d', 'suspend_30d', 'suspend_permanent', 'release'\)/)

  for (const source of [schema, migration]) {
    assert.match(source, /suspended_until timestamp with time zone/)
    assert.match(source, /suspension_reason text/)
    assert.match(source, /moderation_updated_at timestamp with time zone/)
    assert.match(source, /Admins can read moderation actions/)
    assert.match(source, /Admins can insert moderation actions/)
    assert.match(source, /user_private_profiles/)
  }

  assert.match(joinRoute, /suspended_until/)
  assert.match(joinRoute, /\.from\('user_private_profiles'\)/)
  assert.match(joinRoute, /서비스 이용이 정지된 계정입니다/)
})

test('legal pages use a compact system-font document layout', () => {
  const shellSource = readProjectFile('components/legal/LegalShell.tsx')
  const cssSource = readProjectFile('app/globals.css')

  assert.match(shellSource, /className="legal-shell/)
  assert.match(shellSource, /ArrowLeft/)
  assert.match(shellSource, /\/brand\/gatita-logo\.png/)
  assert.doesNotMatch(shellSource, />개인정보처리방침<[\s\S]*>서비스약관</)
  assert.match(cssSource, /\.legal-shell\s*\{/)
  assert.match(cssSource, /font-family:\s*-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;/)
  assert.match(cssSource, /font-size:\s*0\.8125rem;/)
})

test('landing headline shadow is tighter and more natural', () => {
  const source = readProjectFile('app/page.tsx')

  assert.doesNotMatch(source, /0 2px 28px rgba\(28, 22, 92, 0\.45\)/)
  assert.match(source, /0 3px 14px rgba\(21, 28, 72, 0\.30\)/)
})

test('landing headline uses a more expressive React Bits split text entrance', () => {
  const pageSource = readProjectFile('app/page.tsx')
  const splitTextSource = readProjectFile('components/SplitText.tsx')

  assert.match(pageSource, /SplitText/)
  assert.match(pageSource, /splitType="words, chars"/)
  assert.match(pageSource, /className="landing-headline/)
  assert.match(pageSource, /rotateX/)
  assert.match(splitTextSource, /GSAPSplitText/)
  assert.match(splitTextSource, /aria-label=\{text\}/)
})

test('product and design context files document the product UI direction', () => {
  assert.equal(existsSync(join(process.cwd(), 'PRODUCT.md')), true)
  assert.equal(existsSync(join(process.cwd(), 'DESIGN.md')), true)

  const product = readProjectFile('PRODUCT.md')
  const design = readProjectFile('DESIGN.md')

  assert.match(product, /## Register\s+product/)
  assert.match(product, /가천대학교 학생/)
  assert.match(product, /모바일 우선/)
  assert.match(product, /정해진 지점 사이/)
  assert.match(design, /^---/)
  assert.match(design, /name:\s*같이타/)
  assert.match(design, /## 1\. Overview/)
  assert.match(design, /## 2\. Colors/)
  assert.match(design, /Paperlogy/)
  assert.match(design, /#2782ff/)
})
