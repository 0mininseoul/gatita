import assert from 'node:assert/strict'
import { request } from 'node:http'

// Check the delivered HTML, including inherited Next.js metadata. Works against
// a local production build, a preview, or the live site without browser JS.
const baseUrl = process.env.SEO_BASE_URL || 'http://localhost:3000'
const siteUrl = 'https://gatita.kro.kr'
const userAgent = 'Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)'
let failures = 0

// Node's fetch can ignore a custom Host header. Use HTTP directly when testing
// local host routing, otherwise a passing exemption check could be misleading.
function localHostRequest(path, host) {
  const url = new URL(path, baseUrl)
  assert.equal(url.protocol, 'http:', 'local alias checks require an HTTP base URL')
  return new Promise((resolve, reject) => {
    const req = request(url, { headers: { Host: host } }, response => {
      response.resume()
      resolve({
        status: response.statusCode,
        headers: { get: name => response.headers[name.toLowerCase()] },
      })
    })
    req.setTimeout(30_000, () => req.destroy(new Error('HTTP request timed out')))
    req.on('error', reject)
    req.end()
  })
}

async function check(label, run) {
  try {
    await run()
    console.log(`PASS ${label}`)
  } catch (error) {
    failures++
    console.error(`FAIL ${label}: ${error.message}`)
  }
}

async function html(path) {
  const response = await fetch(new URL(path, baseUrl), {
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(30_000),
  })
  assert.equal(response.status, 200, `${path} must return 200`)
  return response.text()
}

function meta(document, name) {
  const tags = document.match(/<meta\b[^>]*>/g) || []
  return tags.filter(tag => tag.includes(`name="${name}"`) || tag.includes(`property="${name}"`))
    .map(tag => tag.match(/content="([^"]*)"/)?.[1])
}

function canonical(document) {
  return (document.match(/<link\b[^>]*>/g) || [])
    .filter(tag => tag.includes('rel="canonical"'))
    .map(tag => tag.match(/href="([^"]*)"/)?.[1])
}

for (const path of ['/', '/?utm_source=seo-check', '/about', '/faq', '/privacy', '/terms']) {
  await check(`public canonical and indexing: ${path}`, async () => {
    const document = await html(path)
    const expected = new URL(path.split('?')[0], siteUrl).href
    assert.equal(canonical(document).length, 1, 'exactly one canonical required')
    assert.equal(new URL(canonical(document)[0]).href, expected)
    assert.ok(!meta(document, 'robots').some(value => /noindex/.test(value)), 'public page must remain indexable')
  })
}

await check('homepage brand identity in HTML and structured data', async () => {
  const document = await html('/')
  const title = document.match(/<title>(.*?)<\/title>/)?.[1]
  assert.equal(title, '같이타 - 가천대 택시 동승 플랫폼')
  assert.deepEqual(meta(document, 'og:title'), [title])
  assert.match(meta(document, 'description')[0], /^같이타는 /)
  assert.deepEqual(meta(document, 'og:description'), meta(document, 'description'))
  const graphs = [...document.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)]
    .flatMap(match => JSON.parse(match[1])['@graph'] || [])
  const website = graphs.find(item => item['@type'] === 'WebSite')
  assert.equal(website?.name, '같이타')
  assert.equal(new URL(website.url).href, `${siteUrl}/`)
})

for (const path of ['/map', '/rooms', '/rooms/seo-check', '/routes', '/settings', '/admin', '/admin/rooms/seo-check']) {
  await check(`app page excluded from search: ${path}`, async () => {
    const document = await html(path)
    assert.ok(meta(document, 'robots').some(value => /\bnoindex\b/.test(value)), 'missing robots noindex')
    assert.equal(canonical(document).length, 0, 'app pages must not inherit the home canonical')
  })
}

await check('sitemap contains only canonical public pages', async () => {
  const xml = await html('/sitemap.xml')
  const locations = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => new URL(match[1]).href).sort()
  assert.deepEqual(locations, ['/', '/about', '/faq', '/privacy', '/terms'].map(path => new URL(path, siteUrl).href).sort())
})

// Optional: test the known production alias after deployment. Preview domains
// must continue to work normally and are deliberately not redirected.
if (process.env.SEO_CHECK_ALIAS) {
  const localCheck = process.env.SEO_CHECK_ALIAS === 'local'
  const aliasFetch = (path) => localCheck ? localHostRequest(path, 'gatitagachon.vercel.app') : fetch(`https://gatitagachon.vercel.app${path}`, {
    redirect: 'manual', signal: AbortSignal.timeout(30_000),
  })
  for (const path of ['/', '/about?utm_source=seo-check', '/faq', '/privacy', '/terms']) {
    await check(`old production hostname redirects: ${path}`, async () => {
      const response = await aliasFetch(path)
      assert.ok([301, 308].includes(response.status), `got ${response.status}`)
      assert.equal(response.headers.get('location'), `${siteUrl}${path}`)
    })
  }
  for (const path of ['/map', '/rooms', '/sw.js', '/service-worker.js', '/manifest.json', '/favicon.png', '/api/profile/me', '/auth/callback']) {
    await check(`legacy app endpoint stays on its host: ${path}`, async () => {
      const response = await aliasFetch(path)
      assert.ok(![301, 308].includes(response.status), `unexpected permanent redirect ${response.status}`)
      const location = response.headers.get('location')
      assert.ok(!location || new URL(location, 'https://gatitagachon.vercel.app').origin !== siteUrl,
        'legacy app endpoints must not redirect to the canonical host')
      if (['/map', '/rooms', '/sw.js', '/service-worker.js', '/manifest.json', '/favicon.png'].includes(path)) {
        assert.equal(response.status, 200)
      }
    })
  }
}

if (process.env.SEO_CHECK_ALIAS === 'local') {
  await check('preview host stays accessible', async () => {
    const response = await localHostRequest('/', 'gatita-seo-check.vercel.app')
    assert.equal(response.status, 200)
  })
}

process.exitCode = failures ? 1 : 0
