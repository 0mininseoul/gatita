import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const origin = 'https://gatita.kro.kr'
const source = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8')

function serviceWorker({ network, cached = new Map() }) {
  const handlers = new Map()
  const cacheReads = []
  vm.runInNewContext(source, {
    URL,
    self: {
      location: { origin },
      addEventListener: (name, handler) => handlers.set(name, handler),
    },
    fetch: network,
    caches: {
      match: async (request) => {
        const url = typeof request === 'string' ? new URL(request, origin).href : request.url
        cacheReads.push(url)
        return cached.get(url)
      },
    },
  })
  return {
    cacheReads,
    navigate(path) {
      let response
      handlers.get('fetch')({
        request: { url: new URL(path, origin).href, method: 'GET', mode: 'navigate', destination: 'document' },
        respondWith: (value) => { response = Promise.resolve(value) },
      })
      return response
    },
  }
}

test('an offline OAuth callback remains a network failure instead of returning the cached homepage', async () => {
  const offline = new TypeError('Network unavailable')
  const worker = serviceWorker({
    network: async () => { throw offline },
    cached: new Map([[`${origin}/`, new Response('cached homepage')]]),
  })

  await assert.rejects(worker.navigate('/auth/callback?code=synthetic-code'), (error) => error === offline)
  assert.deepEqual(worker.cacheReads, [])
})

test('an OAuth callback never falls back to an old cached response for the same callback URL', async () => {
  const offline = new TypeError('Network unavailable')
  const callback = '/auth/callback?code=synthetic-code'
  const worker = serviceWorker({
    network: async () => { throw offline },
    cached: new Map([[`${origin}${callback}`, new Response('stale callback page')]]),
  })

  await assert.rejects(worker.navigate(callback), (error) => error === offline)
  assert.deepEqual(worker.cacheReads, [])
})

test('an online OAuth callback preserves its network redirect response', async () => {
  const redirect = Response.redirect(`${origin}/?auth=complete`, 307)
  const worker = serviceWorker({ network: async () => redirect })

  assert.equal(await worker.navigate('/auth/callback?code=synthetic-code'), redirect)
  assert.deepEqual(worker.cacheReads, [])
})

test('ordinary app navigation can still fall back to its cached homepage when offline', async () => {
  const homepage = new Response('cached homepage')
  const worker = serviceWorker({
    network: async () => { throw new TypeError('Network unavailable') },
    cached: new Map([[`${origin}/`, homepage]]),
  })

  assert.equal(await worker.navigate('/map'), homepage)
})

test('API requests remain network-only even when a cached homepage exists', async () => {
  const offline = new TypeError('Network unavailable')
  const worker = serviceWorker({
    network: async () => { throw offline },
    cached: new Map([[`${origin}/`, new Response('cached homepage')]]),
  })

  await assert.rejects(worker.navigate('/api/profile/me'), (error) => error === offline)
  assert.deepEqual(worker.cacheReads, [])
})
