import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test('lib/auth detects in-app browsers and offers an external-browser escape', () => {
  const source = readProjectFile('lib/auth.ts')

  assert.match(source, /export function detectInAppBrowser/)
  // 에브리타임을 포함한 주요 인앱 브라우저 + Android WebView 표식을 감지해야 한다
  assert.match(source, /Everytime/i)
  assert.match(source, /KAKAOTALK/i)
  assert.match(source, /; wv\\\)/)
  // userAgent 인자를 받아 순수 함수로 테스트 가능해야 한다
  assert.match(source, /detectInAppBrowser\(userAgent\?: string\)/)
  // Android는 intent 스킴으로 Chrome에서 강제 재오픈
  assert.match(source, /export function escapeInAppBrowser/)
  assert.match(source, /intent:\/\//)
  assert.match(source, /package=com\.android\.chrome/)
})

test('real captured Everytime iOS user-agent is detected as in-app + iOS', () => {
  // 2026-06 에브리타임 iOS 인앱 브라우저에서 실제 캡처한 UA (httpbin.org/user-agent)
  const everytimeIOS =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) (everytimeApp; iOS/8.2.4 (iOS/26.5; iPhone))'

  // lib/auth.ts 의 detectInAppBrowser 와 동일한 판별 (TS는 .mjs 테스트에서 import 불가하므로 미러링)
  const brandPattern = /Everytime/i
  const iosPattern = /iPhone|iPad|iPod/i

  assert.ok(brandPattern.test(everytimeIOS), 'Everytime 브랜드 토큰이 감지되어야 한다')
  assert.ok(iosPattern.test(everytimeIOS), 'iOS 기기로 감지되어야 한다')

  // 미러링한 패턴이 실제 소스의 패턴과 어긋나지 않도록 소스에도 동일 패턴이 있는지 확인
  const auth = readProjectFile('lib/auth.ts')
  assert.match(auth, /\/Everytime\/i/)
  assert.match(auth, /iPhone\|iPad\|iPod/)
})

test('landing Google login is guarded; iOS shows a two-line guidance toast', () => {
  const source = readProjectFile('app/page.tsx')

  // 배너는 제거되고 안내는 toast 로만 노출 — 컴포넌트 참조가 남아있으면 안 된다
  assert.doesNotMatch(source, /InAppBrowserNotice/)

  // handleGoogleStart는 OAuth 시도 전에 인앱 여부를 확인하고 차단해야 한다
  const guardIndex = source.indexOf('detectInAppBrowser()')
  const oauthIndex = source.indexOf('signInWithOAuth')
  assert.ok(guardIndex !== -1 && oauthIndex !== -1, 'both guard and oauth call should exist')
  assert.ok(guardIndex < oauthIndex, 'in-app guard must run before signInWithOAuth')

  // iOS 안내 toast: 두 줄(\n + pre-line), 2초, 정확한 문구
  assert.doesNotMatch(source, /toast\.error\(\s*"에브리타임 안에서는 Google 로그인이 안 돼요\./)
  assert.match(source, /icon: '📢'/)
  assert.match(source, /에브리타임 안에서는 Google 로그인이 안 돼요\.\\n우측 상단의 공유 버튼을 눌러 'Safari에서 열기'를 선택해주세요\./)
  assert.match(source, /whiteSpace: 'pre-line'/)
  assert.match(source, /duration: 2000/)
})
