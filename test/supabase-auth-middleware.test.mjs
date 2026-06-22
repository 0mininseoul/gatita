import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test('middleware refreshes Supabase SSR auth cookies before app and API requests', () => {
  const middlewarePath = join(process.cwd(), 'middleware.ts')

  assert.equal(existsSync(middlewarePath), true, 'middleware.ts should exist')

  const source = readProjectFile('middleware.ts')

  assert.match(source, /createServerClient/)
  assert.match(source, /supabase\.auth\.getUser\(\)/)
  assert.match(source, /request\.cookies\.set/)
  assert.match(source, /response\.cookies\.set/)
  assert.match(source, /Cache-Control/)
  assert.match(source, /private, no-store/)
  assert.match(source, /matcher/)
  assert.match(source, /api/)
})
