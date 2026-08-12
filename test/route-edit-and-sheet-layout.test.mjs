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

test('알림 시간대 입력은 폭을 flex 로만 정하고 네이티브 고유 폭을 끈다', () => {
  const page = read('app/routes/page.tsx')
  const css = read('app/globals.css')

  // grid + width:100% 로는 iOS Safari 에서 트랙을 벗어났다. flex-1 basis-0 + min-w-0 은
  // 콘텐츠 고유 폭을 폭 계산에 넣지 않아 그 경로 자체가 없다.
  assert.equal((page.match(/w-0 min-w-0 flex-1 basis-0/g) ?? []).length, 2)
  assert.doesNotMatch(page, /grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/)

  // appearance 를 끄지 않으면 iOS 가 컨트롤 고유 폭을 계속 강제한다.
  assert.match(css, /input\[type="time"\][\s\S]{0,200}?-webkit-appearance:\s*none/)
})

test('구독 경로 카드는 한 줄이고 컨트롤은 수정·토글 둘뿐이다', () => {
  const source = read('app/routes/page.tsx')

  // 삭제 아이콘을 뺐기 때문에 한 줄로 되돌릴 수 있었다(아이콘 3개면 375px 에서 잘렸다).
  // 삭제는 수정 모드 폼 하단에만 있다.
  assert.doesNotMatch(source, /aria-label=\{`\$\{label\} 경로 삭제`\}/)
  assert.match(source, /이 경로 알림 삭제/)
  assert.doesNotMatch(source, /className="settings-row flex-col/)
})
