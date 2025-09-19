// PWA 관련 유틸리티 함수들

export const isPWASupported = (): boolean => {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator
}

export const isInstalled = (): boolean => {
  if (typeof window === 'undefined') return false
  
  // PWA로 설치되어 실행 중인지 확인
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true
}

export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!isPWASupported()) {
    console.log('Service Worker not supported')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    console.log('SW registered: ', registration)
    
    // 업데이트 확인
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // 새 버전 사용 가능
              console.log('New or updated content is available.')
            } else {
              // 첫 설치
              console.log('Content is cached for offline use.')
            }
          }
        })
      }
    })

    return registration
  } catch (error) {
    console.error('SW registration failed: ', error)
    return null
  }
}

export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications')
    return 'denied'
  }

  if (Notification.permission === 'granted') {
    return 'granted'
  }

  if (Notification.permission === 'denied') {
    return 'denied'
  }

  // 권한 요청
  const permission = await Notification.requestPermission()
  return permission
}

export const showLocalNotification = (title: string, options?: NotificationOptions) => {
  if (Notification.permission === 'granted') {
    const notification = new Notification(title, {
      icon: '/icon-192x192.png',
      badge: '/icon-72x72.png',
      ...options
    })

    // 알림 클릭 시 브라우저로 포커스
    notification.onclick = () => {
      window.focus()
      notification.close()
    }

    return notification
  }
  return null
}

// 푸시 알림 구독
export const subscribeToPushNotifications = async (
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> => {
  try {
    // VAPID 공개 키 (실제 프로젝트에서는 환경변수로 관리)
    const vapidPublicKey = 'YOUR_VAPID_PUBLIC_KEY_HERE'
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidPublicKey
    })

    console.log('Push subscription:', subscription)
    return subscription
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error)
    return null
  }
}

// 앱 설치 프롬프트 관리
export class PWAInstallManager {
  private deferredPrompt: any = null
  private isInstallable = false

  constructor() {
    if (typeof window !== 'undefined') {
      this.setupInstallPrompt()
    }
  }

  private setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      // 기본 브라우저 설치 프롬프트 막기
      e.preventDefault()
      this.deferredPrompt = e
      this.isInstallable = true
      console.log('PWA install prompt ready')
    })

    window.addEventListener('appinstalled', () => {
      console.log('PWA was installed')
      this.deferredPrompt = null
      this.isInstallable = false
    })
  }

  public canInstall(): boolean {
    return this.isInstallable && this.deferredPrompt !== null
  }

  public async showInstallPrompt(): Promise<boolean> {
    if (!this.canInstall()) {
      return false
    }

    try {
      // 설치 프롬프트 표시
      this.deferredPrompt.prompt()
      
      // 사용자 선택 대기
      const { outcome } = await this.deferredPrompt.userChoice
      console.log(`User response to the install prompt: ${outcome}`)
      
      // 프롬프트 정리
      this.deferredPrompt = null
      this.isInstallable = false
      
      return outcome === 'accepted'
    } catch (error) {
      console.error('Error showing install prompt:', error)
      return false
    }
  }
}

// PWA 상태 감지
export const getPWADisplayMode = (): string => {
  if (typeof window === 'undefined') return 'browser'
  
  if ((window.navigator as any).standalone) return 'standalone'
  if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone'
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return 'minimal-ui'
  if (window.matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen'
  
  return 'browser'
}

// 오프라인 상태 감지
export const useOnlineStatus = () => {
  if (typeof window === 'undefined') return true
  
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}

// 필요한 React import
import { useState, useEffect } from 'react'