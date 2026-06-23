import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test('map marker prioritizes the current user room state over room count and selected origin text', () => {
  const mapSource = readProjectFile('components/CampusRouteMap.tsx')
  const pageSource = readProjectFile('app/page.tsx')
  const cssSource = readProjectFile('app/globals.css')

  assert.match(mapSource, /currentUserId\?: string/)
  assert.match(pageSource, /currentUserId=\{user\?\.id\}/)
  assert.match(mapSource, /participant\.user_id === currentUserId/)
  assert.match(mapSource, /is-my-origin/)
  assert.match(cssSource, /\.gatita-map-overlay\.is-my-origin::after/)
  assert.match(cssSource, /box-shadow: 0 14px 32px rgba\(31, 110, 240, 0\.24\), 0 0 0 4px rgba\(39, 130, 255, 0\.16\)/)
  assert.match(mapSource, /hasMyOriginRoom \? '참여중' : isOrigin \? '출발' : `\$\{originStat\.roomCount\}개`/)
  assert.match(mapSource, /내 방/)
  assert.match(mapSource, /isMyRoom \? '열기' :/)
})
