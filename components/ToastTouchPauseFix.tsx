'use client'

import { useEffect } from 'react'

// [버그 원인] react-hot-toast의 <Toaster>는 컨테이너에 onMouseEnter/onMouseLeave를 달아
// "호버 중엔 자동 dismiss를 멈춘다"를 구현한다(node_modules/react-hot-toast/src/components/toaster.tsx).
// 이 pausedAt은 토스터 전체에 걸리는 단일 상태라서(node_modules/react-hot-toast/src/core/store.ts),
// 한 번이라도 mouseenter만 걸리고 mouseleave가 안 걸리면 그 세션의 모든 토스트가 그때부터
// 영원히 dismiss되지 않는다(node_modules/react-hot-toast/src/core/use-toaster.ts의
// `if (pausedAt) return` 가드).
//
// 터치 기기(iOS Safari/PWA 포함)에서 탭은 touchstart → touchend → mouseover → mousedown →
// mouseup → click 순으로 마우스 이벤트를 "합성"하는데, 실제 손가락이 움직여 떠나는 게
// 아니므로 대응하는 mouseout/mouseleave가 뒤따르지 않는다. 토스트 카드 위를 한 번이라도
// 탭하면(예: 중복 방 안내 토스트의 버튼을 탭) pausedAt이 걸린 채 풀리지 않고, 이후 만들어지는
// "채팅방이 생성되었습니다!" 같은 평범한 토스트까지 전부 쌓이기만 하고 사라지지 않는다.
//
// Playwright로 실제 브라우저의 touch-to-mouse 합성 이벤트(page.touchscreen.tap)를 재현해
// 확인함: 터치 후 3초가 지나도(duration 800ms) 토스트가 DOM에 남아 있었고, 인위적으로
// mouseout을 흘려보내자 즉시 정상적으로 사라졌다.
//
// 고칠 수 없는 라이브러리 내부 상태이므로, 터치가 끝날 때마다 토스터 컨테이너에 인위적인
// mouseout을 흘려보내 멈춰 있을 수 있는 pausedAt을 강제로 풀어준다. setTimeout(0)으로 한 틱
// 미루는 이유는 touchend 시점엔 아직 브라우저가 합성 mouseover를 쏘기 전이라, 그 전에
// mouseout을 보내면 뒤이어 오는 mouseover가 다시 멈춰버리기 때문이다(합성 이벤트 순서:
// touchend가 먼저, mouseover/click은 그 다음 태스크에 온다). 실제 마우스 사용자는 이 리스너가
// 아예 발동하지 않으므로(touchend/touchcancel이 발생하지 않음) 호버로 일시정지하는 원래
// 동작에는 영향이 없다.
export default function ToastTouchPauseFix() {
  useEffect(() => {
    const resume = () => {
      window.setTimeout(() => {
        const container = document.querySelector('[data-rht-toaster]')
        container?.dispatchEvent(
          new MouseEvent('mouseout', {
            bubbles: true,
            cancelable: true,
            relatedTarget: document.body,
          }),
        )
      }, 0)
    }

    document.addEventListener('touchend', resume, { passive: true })
    document.addEventListener('touchcancel', resume, { passive: true })
    return () => {
      document.removeEventListener('touchend', resume)
      document.removeEventListener('touchcancel', resume)
    }
  }, [])

  return null
}
