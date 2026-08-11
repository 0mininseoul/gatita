import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

function loadRepeatRoutePrompt() {
  const source = readFileSync(join(process.cwd(), 'lib/repeatRoutePrompt.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })

  const module = { exports: {} }
  // lib/repeatRoutePrompt.ts는 순수 함수만 두는 파일이라 원래 import가 없어야 한다.
  // 알 수 없는 import가 들어오면 즉시 throw해, 나중에 누군가 DB·네트워크 의존성을
  // 몰래 추가해도 이 테스트가 감지하도록 한다 (duplicate-room.test.mjs 관례).
  const require = (specifier) => {
    throw new Error(`Unexpected import in test: ${specifier}`)
  }

  new Function('require', 'module', 'exports', outputText)(require, module, module.exports)
  return module.exports
}

test('2회 이상 + 미구독 + 미거절이면 프롬프트를 띄운다', () => {
  const { shouldPromptRepeatRouteSubscription } = loadRepeatRoutePrompt()

  assert.equal(
    shouldPromptRepeatRouteSubscription({
      createdRoomCount: 2,
      isAlreadySubscribed: false,
      wasPreviouslyDismissed: false,
    }),
    true,
  )
})

test('1회만 만들었으면 띄우지 않는다', () => {
  const { shouldPromptRepeatRouteSubscription } = loadRepeatRoutePrompt()

  assert.equal(
    shouldPromptRepeatRouteSubscription({
      createdRoomCount: 1,
      isAlreadySubscribed: false,
      wasPreviouslyDismissed: false,
    }),
    false,
  )
})

test('3회 이상 만들었어도(2회 이상 조건은 그대로) 미구독·미거절이면 띄운다', () => {
  const { shouldPromptRepeatRouteSubscription } = loadRepeatRoutePrompt()

  assert.equal(
    shouldPromptRepeatRouteSubscription({
      createdRoomCount: 5,
      isAlreadySubscribed: false,
      wasPreviouslyDismissed: false,
    }),
    true,
  )
})

test('이미 구독 중이면 2회 이상이어도 띄우지 않는다', () => {
  const { shouldPromptRepeatRouteSubscription } = loadRepeatRoutePrompt()

  assert.equal(
    shouldPromptRepeatRouteSubscription({
      createdRoomCount: 3,
      isAlreadySubscribed: true,
      wasPreviouslyDismissed: false,
    }),
    false,
  )
})

test('한 번 거절한 적이 있으면 2회 이상 + 미구독이어도 다시 띄우지 않는다', () => {
  const { shouldPromptRepeatRouteSubscription } = loadRepeatRoutePrompt()

  assert.equal(
    shouldPromptRepeatRouteSubscription({
      createdRoomCount: 4,
      isAlreadySubscribed: false,
      wasPreviouslyDismissed: true,
    }),
    false,
  )
})

test('0회(비정상 입력)면 띄우지 않는다', () => {
  const { shouldPromptRepeatRouteSubscription } = loadRepeatRoutePrompt()

  assert.equal(
    shouldPromptRepeatRouteSubscription({
      createdRoomCount: 0,
      isAlreadySubscribed: false,
      wasPreviouslyDismissed: false,
    }),
    false,
  )
})

test('buildRepeatRoutePromptDismissKey는 from/to 조합마다 다른 키를 만든다', () => {
  const { buildRepeatRoutePromptDismissKey } = loadRepeatRoutePrompt()

  const keyA = buildRepeatRoutePromptDismissKey('가천대역_1번출구', '제2기숙사')
  const keyB = buildRepeatRoutePromptDismissKey('가천대역_1번출구', 'AI공학관')

  assert.notEqual(keyA, keyB)
  assert.match(keyA, /^gatita:repeat_route_prompt:dismissed:/)
  assert.match(keyA, /가천대역_1번출구>제2기숙사$/)
})

test('buildRepeatRoutePromptDismissKey는 같은 입력에 대해 결정적이다', () => {
  const { buildRepeatRoutePromptDismissKey } = loadRepeatRoutePrompt()

  const first = buildRepeatRoutePromptDismissKey('가천대역_1번출구', '제2기숙사')
  const second = buildRepeatRoutePromptDismissKey('가천대역_1번출구', '제2기숙사')

  assert.equal(first, second)
})

// "간단하면 지금": 배경(backdrop)을 실수로 한 번 탭해도 그 경로가 영구 봉인되면 안
// 된다. 명시적 거절(X, "다음에요")에만 localStorage에 저장돼야 한다. lib/repeatRoutePrompt.ts
// 는 순수 함수만 있어 이 동작 자체는 components/HomeClient.tsx 쪽 핸들러 배선 문제이므로
// 소스 텍스트를 직접 검사한다(profile-setup-analytics.test.mjs 관례).
test('반복 방 생성 프롬프트: 배경 탭은 영구 거절을 저장하지 않는 핸들러를 쓴다', () => {
  const homeClient = readFileSync(join(process.cwd(), 'components', 'HomeClient.tsx'), 'utf8')

  assert.match(
    homeClient,
    /if \(!isSubscribingRepeatRoute\) dismissRepeatRoutePromptSilently\(\)/,
    '배경(backdrop) onClick은 dismissRepeatRoutePromptSilently를 호출해야 한다',
  )

  const silentHandlerMatch = homeClient.match(
    /const dismissRepeatRoutePromptSilently = \(\) => \{([\s\S]*?)\n  \}/,
  )
  assert.ok(silentHandlerMatch, 'dismissRepeatRoutePromptSilently 정의를 찾아야 한다')
  assert.doesNotMatch(
    silentHandlerMatch[1],
    /localStorage\.setItem/,
    '배경 탭 핸들러는 localStorage에 영구 거절을 기록하면 안 된다',
  )

  // X 버튼과 "다음에요" 버튼은 여전히 영구 저장하는 dismissRepeatRoutePrompt를 써야 한다.
  const persistingHandlerMatch = homeClient.match(
    /const dismissRepeatRoutePrompt = \(\) => \{([\s\S]*?)\n  \}/,
  )
  assert.ok(persistingHandlerMatch, 'dismissRepeatRoutePrompt(영구 저장) 정의를 찾아야 한다')
  assert.match(
    persistingHandlerMatch[1],
    /localStorage\.setItem/,
    '명시적 거절(X/다음에요)은 여전히 localStorage에 기록해야 한다',
  )
})
