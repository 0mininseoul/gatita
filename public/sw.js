const CACHE_NAME = 'gatita-v1.0.2'
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
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      })
      .then(() => self.clients.claim())
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
