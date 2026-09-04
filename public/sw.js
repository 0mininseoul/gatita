const CACHE_NAME = 'gatita-v1.0.4'
const APP_CACHE_PREFIX = 'gatita-'
const urlsToCache = [
  '/',
  '/map',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
]

// Service Worker 설치
self.addEventListener('install', (event) => {
  self.skipWaiting()

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache opened')
        return cache.addAll(urlsToCache)
      })
  )
})

// Service Worker 활성화
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys()
      const hasPreviousAppCache = cacheNames.some(
        (cacheName) => cacheName.startsWith(APP_CACHE_PREFIX) && cacheName !== CACHE_NAME
      )

      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )

      await self.clients.claim()

      // This release moves room creation from two browser-side inserts to one
      // authenticated RPC. Reload every controlled app window once on upgrade
      // so an already-open PWA cannot keep calling the retired write path.
      if (hasPreviousAppCache) {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        await Promise.all(
          windows.map(async (client) => {
            if (!('navigate' in client)) return
            if (new URL(client.url).origin !== self.location.origin) return

            try {
              await client.navigate(client.url)
            } catch (error) {
              console.warn('Unable to refresh an upgraded app window:', error)
            }
          })
        )
      }
    })()
  )
})

function isCacheableAppShellRequest(request, requestUrl) {
  if (request.method !== 'GET') return false
  if (requestUrl.origin !== self.location.origin) return false
  if (requestUrl.pathname.startsWith('/api/')) return false
  if (requestUrl.pathname.startsWith('/auth/')) return false
  if (requestUrl.pathname.startsWith('/rooms/')) return false
  if (requestUrl.pathname.startsWith('/settings')) return false
  if (requestUrl.pathname.startsWith('/admin')) return false

  return urlsToCache.includes(requestUrl.pathname)
}

// 네트워크 요청 가로채기
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url)

  if (event.request.method !== 'GET') {
    return
  }

  if (requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request))
    return
  }

  event.respondWith(
    fetch(event.request).then((response) => {
      // 유효하지 않은 응답이면 그대로 반환
      if (!response || response.status !== 200 || response.type !== 'basic') {
        return response
      }

      if (isCacheableAppShellRequest(event.request, requestUrl)) {
        // 응답을 복제해서 캐시에 저장
        const responseToCache = response.clone()
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache)
          })
      }

      return response
    }).catch(() => {
      if (event.request.mode !== 'navigate' && event.request.destination !== 'document') {
        return
      }

      return caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse
        }

        // 오프라인 상태에서 기본 페이지 반환
        return caches.match('/')
      })
    })
  )
})

// 푸시 수신: 채팅 새 메시지 알림
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (error) {
    data = { body: event.data ? event.data.text() : '새 메시지가 도착했어요' }
  }

  const title = data.title || '같이타'
  const roomId = data.roomId || null
  const options = {
    body: data.body || '새 메시지가 도착했어요',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: data.tag || 'gatita-message',
    renotify: true,
    data: {
      url: data.url || '/map',
      roomId: roomId,
    },
  }

  event.waitUntil(
    (async () => {
      // 이미 해당 채팅방을 열어 보고 있으면 알림을 띄우지 않음
      if (roomId) {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        const isViewingRoom = windows.some(
          (client) => client.focused && client.url.includes('/rooms/' + roomId)
        )
        if (isViewingRoom) return
      }
      await self.registration.showNotification(title, options)
    })()
  )
})

// 알림 클릭: 해당 채팅방으로 이동/포커스
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/map'
  const targetHref = new URL(targetUrl, self.location.origin).href

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus()
          if (client.url !== targetHref && 'navigate' in client) {
            try {
              await client.navigate(targetHref)
            } catch (error) {
              // navigate 실패 시 무시하고 포커스만 유지
            }
          }
          return
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl)
      }
    })()
  )
})
