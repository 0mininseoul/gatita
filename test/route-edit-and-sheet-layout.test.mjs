import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

// 여기 셋은 브라우저에서 폭을 실측해서 고른 값이라, 되돌려도 타입체크·빌드가 모두
// 통과하고 좁은 기기에서만 조용히 깨진다. 그 세 가지만 잠근다.
function read(relativePath) {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

test('구독 유도 시트 헤드라인은 한 줄로 유지되고 글자 크기가 카드 폭에 연동된다', () => {
  const source = read('components/HomeClient.tsx')
  const headline = source.match(
    /<h2\s+id="repeat-route-prompt-title"[\s\S]{0,400}?>\s*이 경로에 방이 생기면 알림을 받아보시겠어요\?/,
  )

  assert.ok(headline, '구독 유도 시트의 헤드라인을 찾지 못했다')
  assert.match(headline[0], /whitespace-nowrap/)
  // 고정 크기로 되돌리면 375px 이하에서 넘친다.
  assert.match(headline[0], /calc\(\(100vw - 56px\) \/ 19\)/)
})

test('알림 시간대 그리드는 트랙과 입력이 0까지 줄어들 수 있다', () => {
  const source = read('app/routes/page.tsx')

  // 1fr(= minmax(auto,1fr))이면 <input type="time">의 고유 폭 아래로 트랙이 줄지 않아
  // 카드 오른쪽으로 삐져나간다 — 240px 컨테이너에서 314.8px 로 넘치는 걸 실측했다.
  assert.match(source, /grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/)
  assert.doesNotMatch(source, /grid-cols-\[1fr_auto_1fr\]/)
})

test('구독 경로 카드는 경로 이름에 한 행을 통째로 준다', () => {
  const source = read('app/routes/page.tsx')

  // 이름과 컨트롤이 같은 행이면 아이콘 3개에 밀려 375px 에서 가능한 48개 조합 중
  // 20개가 말줄임된다(실측). 행을 나눈 뒤에는 320px 에서도 0개다.
  assert.match(source, /className="settings-row flex-col items-stretch/)
})
