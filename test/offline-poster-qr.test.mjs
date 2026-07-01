import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

function readProjectFile(path) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function loadQrExports() {
  const source = readProjectFile('lib/marketing/qr.ts')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })

  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(
    (specifier) => {
      if (specifier === '@/lib/seo') return { SITE_URL: 'https://gatita.kro.kr' }
      throw new Error(`Unexpected import in QR utility: ${specifier}`)
    },
    module,
    module.exports,
  )
  return module.exports
}

test('offline poster QR utility builds a stable campaign URL and destination', () => {
  const {
    OFFLINE_POSTER_QR_CAMPAIGN,
    buildOfflinePosterDestinationPath,
    buildOfflinePosterQrUrl,
    getOfflinePosterQrEventProperties,
  } = loadQrExports()

  assert.equal(OFFLINE_POSTER_QR_CAMPAIGN.id, 'offline_poster_2026_summer')
  assert.equal(OFFLINE_POSTER_QR_CAMPAIGN.eventName, 'qr_poster_scanned')
  assert.equal(buildOfflinePosterQrUrl(), 'https://gatita.kro.kr/qr/poster')
  assert.equal(buildOfflinePosterQrUrl('https://example.com/'), 'https://example.com/qr/poster')
  assert.equal(
    buildOfflinePosterDestinationPath(),
    '/map?utm_source=offline_poster&utm_medium=qr&utm_campaign=offline_poster_2026_summer&utm_content=campus_poster&qr_code=offline_poster_2026_summer',
  )
  assert.deepEqual(getOfflinePosterQrEventProperties(), {
    qr_code_id: 'offline_poster_2026_summer',
    qr_placement: 'offline_poster',
    qr_content: 'campus_poster',
    destination_path: '/map',
    utm_source: 'offline_poster',
    utm_medium: 'qr',
    utm_campaign: 'offline_poster_2026_summer',
    utm_content: 'campus_poster',
  })
})

test('poster QR entry page tracks the scan before redirecting to the app', () => {
  const pagePath = 'app/qr/poster/page.tsx'
  const clientPath = 'app/qr/poster/OfflinePosterQrRedirectClient.tsx'

  assert.equal(existsSync(join(process.cwd(), pagePath)), true)
  assert.equal(existsSync(join(process.cwd(), clientPath)), true)

  const pageSource = readProjectFile(pagePath)
  const clientSource = readProjectFile(clientPath)
  const analyticsSource = readProjectFile('lib/analytics/client.ts')

  assert.match(pageSource, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/)
  assert.match(clientSource, /trackEvent\(OFFLINE_POSTER_QR_CAMPAIGN\.eventName,\s*getOfflinePosterQrEventProperties\(\)\)/)
  assert.match(clientSource, /flushAnalytics\(\)/)
  assert.match(clientSource, /router\.replace\(buildOfflinePosterDestinationPath\(\)\)/)
  assert.match(analyticsSource, /export function flushAnalytics\(\)/)
  assert.match(analyticsSource, /amplitude\.flush\(\)\.promise/)
})

test('poster QR code asset exists for print design handoff', () => {
  const pngPath = join(process.cwd(), 'public/qr/offline-poster-2026-summer.png')

  assert.equal(existsSync(pngPath), true)
  assert.ok(statSync(pngPath).size > 1000, 'QR PNG should be a non-empty print asset')
})
