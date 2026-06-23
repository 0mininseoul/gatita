import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const layoutSource = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')

test('Vercel Web Analytics is installed and rendered from the root layout', () => {
  assert.ok(
    packageJson.dependencies?.['@vercel/analytics'],
    '@vercel/analytics must be installed as an application dependency',
  )
  assert.match(layoutSource, /from ['"]@vercel\/analytics\/next['"]/)
  assert.match(layoutSource, /<Analytics\s*\/>/)
})
