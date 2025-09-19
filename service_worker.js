const CACHE_NAME = 'gaji-ta-v1.0.0'
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
]

// Service Worker 설치
self.addEventListener('install', (event) => {
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
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
})

// 네트워크 요청 가로채기
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 캐시에 있으면 캐시에서 반환
        if (response) {
          return response
        }

        // 캐시에 없으면 네트워크에서 가져오기
        return fetch(event.request).then((response) => {
          // 유효하지 않은 응답이면 그대로 반환
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response
          }

          // 응답을 복제해서 캐시에 저장
          const responseToCache = response.clone()
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache)
            })

          return response
        }).catch(() => {
          // 오프라인 상태에서 기본 페이지 반환
          if (event.request.destination === 'document') {
            return caches.match('/')
          }
        })
      })
  )
})

// 푸시 알림 수신
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json()
    
    const options = {
      body: data.body || '새로운 알림이 있습니다',
      icon: '/icon-192x192.png',
      badge: '/icon-72x72.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: data.id || 1,
        url: data.url || '/'
      },
      actions: [
        {
          action: 'explore',
          title: '확인하기',
          icon: '/icon-72x72.png'
        },
        {
          action: 'close',
          title: '닫기',
          icon: '/icon-72x72.png'
        }
      ],
      requireInteraction: true,
      tag: data.tag || 'default'
    }

    event.waitUntil(
      self.registration.showNotification(
        data.title || '같이타 알림',
        options
      )
    )
  }
})

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'close') {
    return
  }

  const urlToOpen = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // 이미 열린 탭이 있으면 그 탭으로 이동
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus()
          }
        }

        // 열린 탭이 없으면 새로 열기
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen)
        }
      })
  )
})

// 알림 닫기 처리
self.addEventListener('notificationclose', (event) => {
  console.log('Notification was closed', event)
})

// 백그라운드 동기화
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('Background sync triggered')
    // 여기에 오프라인에서 쌓인 데이터 동기화 로직 추가
  }
})