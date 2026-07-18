'use client'

// PWA Web Push 클라이언트 헬퍼.
// 구독/해제/상태확인 + 서비스워커 등록 보장.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

export type PushSetupResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'no-key' | 'error' }

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const outputArray = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// 서비스워커가 등록/활성화되어 있도록 보장하고 registration 을 반환.
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null
  try {
    const existing = await navigator.serviceWorker.getRegistration()
    const registration = existing ?? (await navigator.serviceWorker.register('/sw.js'))
    await navigator.serviceWorker.ready
    return registration
  } catch (error) {
    console.error('Service worker registration failed:', error)
    return null
  }
}

// 권한 요청 → 푸시 구독 → 서버 저장. 반드시 사용자 제스처(버튼 탭) 안에서 호출해야 iOS 에서 동작.
export async function subscribeToPush(): Promise<PushSetupResult> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: 'no-key' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: 'denied' }
  }

  const registration = await ensureServiceWorker()
  if (!registration) return { ok: false, reason: 'error' }

  try {
    const existing = await registration.pushManager.getSubscription()
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }))

    const json = subscription.toJSON()
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      }),
    })

    if (!response.ok) return { ok: false, reason: 'error' }
    return { ok: true }
  } catch (error) {
    console.error('Push subscription failed:', error)
    return { ok: false, reason: 'error' }
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return

    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {})

    await subscription.unsubscribe().catch(() => {})
  } catch (error) {
    console.error('Push unsubscription failed:', error)
  }
}

export async function isSubscribedToPush(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    return Boolean(subscription)
  } catch {
    return false
  }
}
