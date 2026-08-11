import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

// I-2: 지난 방(출발 시각이 지난 방)이라도 내 방이면 지도 하단 시트의 입장 버튼이
// 활성화되어야 한다 — 이 서비스는 탑승 '후' 채팅방에서 정산(계좌 공유·송금)을 하므로
// 출발 이후가 채팅이 가장 필요한 시점이다.
//
// 이 프로젝트 관례(test/map-current-room-indicator.test.mjs 등)대로 컴포넌트를 렌더링하지
// 않고 소스를 읽어 패턴을 단언하되, 여기서는 한 걸음 더 나아가 실제 disabled/label
// 표현식 문자열을 추출해 진짜로 평가한다 — 그래야 수정 전 조건(`isJoinDisabled ||
// isPastDeparture`, isMyRoom을 고려하지 않음)으로 되돌아가면 이 테스트가 실패한다.
function readMapSource() {
  return readFileSync(join(process.cwd(), 'components/CampusRouteMap.tsx'), 'utf8')
}

function extractExpression(source, marker) {
  const idx = source.indexOf(marker)
  assert.notEqual(idx, -1, `${marker} 를 찾을 수 없습니다`)
  const start = idx + marker.length
  const end = source.indexOf('}', start)
  assert.notEqual(end, -1)
  return source.slice(start, end)
}

function evalExpression(expr, vars) {
  const fn = new Function(
    'isJoinDisabled',
    'isPastDeparture',
    'isMyRoom',
    'isFull',
    `return (${expr})`,
  )
  return fn(vars.isJoinDisabled, vars.isPastDeparture, vars.isMyRoom, vars.isFull)
}

test('입장 버튼 disabled: 지난 방 + 내 방 → 활성(비활성 아님), 지난 방 + 남의 방 → 비활성', () => {
  const source = readMapSource()
  const disabledExpr = extractExpression(source, 'disabled={')

  // 지난 방 + 내 방 → 활성화되어야 한다 (disabled=false)
  assert.equal(
    evalExpression(disabledExpr, { isJoinDisabled: false, isPastDeparture: true, isMyRoom: true, isFull: false }),
    false,
    '지난 방이라도 내 방이면 입장(열기) 버튼이 활성화되어야 한다',
  )

  // 지난 방 + 남의 방 → 비활성 유지
  assert.equal(
    evalExpression(disabledExpr, { isJoinDisabled: false, isPastDeparture: true, isMyRoom: false, isFull: false }),
    true,
    '지난 방이고 내 방이 아니면 계속 비활성이어야 한다',
  )

  // 지난 방이 아니어도 정원이 차 있으면(isJoinDisabled) 여전히 비활성
  assert.equal(
    evalExpression(disabledExpr, { isJoinDisabled: true, isPastDeparture: false, isMyRoom: false, isFull: true }),
    true,
    '정원이 찬 남의 방은 지난 방 여부와 무관하게 비활성이어야 한다',
  )

  // 지난 방이 아니고 내 방이면 원래도 활성
  assert.equal(
    evalExpression(disabledExpr, { isJoinDisabled: false, isPastDeparture: false, isMyRoom: true, isFull: false }),
    false,
  )
})

test('입장 버튼 라벨: 지난 방 + 내 방은 "출발한 방"이 아니라 "열기"로 표시된다', () => {
  const source = readMapSource()
  const labelMatch = source.match(/\{isPastDeparture[^}]*\? '출발한 방' : isMyRoom \? '열기' : isFull \? '마감' : '입장하기'\}/)
  assert.ok(labelMatch, '버튼 라벨 표현식을 찾을 수 없습니다')

  const conditionExpr = labelMatch[0].slice(1, labelMatch[0].indexOf('?')).trim()
  const fn = new Function('isPastDeparture', 'isMyRoom', `return (${conditionExpr})`)

  // 지난 방 + 내 방 → "출발한 방" 조건 자체가 false 여야 '열기' 분기로 간다
  assert.equal(fn(true, true), false, '지난 방이라도 내 방이면 "출발한 방" 라벨 조건이 꺼져야 한다')
  // 지난 방 + 남의 방 → "출발한 방" 유지
  assert.equal(fn(true, false), true)
})

test('흐림 처리는 내 방 여부와 무관하게 지난 방이면 계속 유지되되, 텍스트 영역에만 걸려 버튼은 항상 불투명하다', () => {
  const source = readMapSource()
  const cardStart = source.indexOf('selectedOriginRooms.map')
  const cardEnd = source.indexOf('})}', cardStart)
  const cardBlock = source.slice(cardStart, cardEnd)

  assert.ok(cardStart > -1, '지난 방 카드 블록을 찾을 수 없습니다')

  // opacity-55는 isPastDeparture 단독 조건으로, 텍스트를 감싼 min-w-0 div에만 걸려야
  // 한다 — 카드 전체(버튼 포함)에 걸리면 활성 버튼까지 흐려져 눌리는데 안 눌릴 것처럼
  // 보인다(접근성 문제).
  assert.match(cardBlock, /<div className=\{`min-w-0 \$\{isPastDeparture \? 'opacity-55' : ''\}`\}>/)

  // 카드 최상위 div의 className에는 opacity-55가 없어야 한다 — 버튼까지 흐려지는
  // 회귀를 잡기 위해, 첫 className 선언(카드 wrapper)만 떼어 확인한다.
  const wrapperClassMatch = cardBlock.match(/className=\{`flex items-center justify-between[\s\S]*?`\}/)
  assert.ok(wrapperClassMatch, '카드 wrapper의 className 표현식을 찾을 수 없습니다')
  assert.doesNotMatch(wrapperClassMatch[0], /opacity-55/, '카드 wrapper 자체에는 opacity-55가 없어야 한다(버튼까지 흐려지는 회귀 방지)')

  // 예전의 별도 텍스트 뱃지("출발함" 한 단어짜리 <span> 태그)는 제거되었다 — 흐림
  // 처리 + 버튼 라벨("출발한 방")로 이미 상태가 전달되므로 중복이었다. 태그 형태로
  // 검사해, 이 단정이 위 설명 주석의 인용문과 우연히 겹치지 않게 한다.
  assert.doesNotMatch(cardBlock, /<span className="inline-flex items-center rounded-md bg-gray-100[^>]*>\s*출발함/)
})
