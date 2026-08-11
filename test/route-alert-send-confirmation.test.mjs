import assert from 'node:assert/strict'
import { test } from 'node:test'
// scripts/send-route-alert-email.mjs는 순수 JS(.mjs)라 transpileModule 없이 바로
// import할 수 있다. main()은 "직접 실행됐을 때만" 도는 가드가 있어(파일 하단
// isMainModule 체크), import만으로는 DB 접속/발송이 전혀 일어나지 않는다.
import { isSendConfirmed } from '../scripts/send-route-alert-email.mjs'

test('확인 토큰과 정확히 일치할 때만 true를 반환한다', () => {
  assert.equal(isSendConfirmed('send'), true)
})

test('앞뒤 공백/개행은 trim 후 비교한다', () => {
  assert.equal(isSendConfirmed('  send\n'), true)
})

test('대소문자, 오타, 빈 문자열, 엔터만 누른 경우는 모두 거부한다', () => {
  assert.equal(isSendConfirmed('SEND'), false)
  assert.equal(isSendConfirmed('Send'), false)
  assert.equal(isSendConfirmed('sned'), false)
  assert.equal(isSendConfirmed('yes'), false)
  assert.equal(isSendConfirmed(''), false)
  assert.equal(isSendConfirmed('   '), false)
})

test('문자열이 아닌 값(undefined 등)도 안전하게 거부한다', () => {
  assert.equal(isSendConfirmed(undefined), false)
  assert.equal(isSendConfirmed(null), false)
})
