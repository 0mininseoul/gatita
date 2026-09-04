import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const root = process.cwd()

function readProjectFile(...parts) {
  return readFileSync(join(root, ...parts), 'utf8')
}

const migrationPath = [
  'supabase',
  'migrations',
  '20260904035539_add_dormitory_ride_requests.sql',
]

test('schema stores private dormitory consent and a constrained room source', () => {
  const migration = readProjectFile(...migrationPath)
  const schema = readProjectFile('supabase_schema.sql')

  for (const source of [migration, schema]) {
    assert.match(source, /is_dormitory_resident\s+boolean/i)
    assert.match(source, /creation_source\s+text\s+not null\s+default 'standard'/i)
    assert.match(source, /creation_source in \('standard', 'dormitory_request'\)/i)
    assert.match(
      source,
      /from_location in \('가천대역_1번출구', '가천대학교_정문'\)[\s\S]*to_location = '제2기숙사'/i,
    )
    assert.match(
      source,
      /from_location = '제2기숙사'[\s\S]*to_location in \('가천대역_1번출구', '가천대학교_정문', '교육대학원', '중앙도서관', '학생회관'\)/i,
    )
  }
})

test('local Supabase types expose the private preference and room source', () => {
  const source = readProjectFile('lib', 'supabase.ts')

  assert.match(source, /is_dormitory_resident\?: boolean \| null/)
  assert.match(source, /creation_source: 'standard' \| 'dormitory_request'/)
})
