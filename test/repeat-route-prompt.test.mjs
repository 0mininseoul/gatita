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
