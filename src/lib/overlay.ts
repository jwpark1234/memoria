import { useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'

/**
 * 창 뒤 배경(overlay)을 누르면 닫는다. 누르기 시작한 곳도 배경이어야 닫는다:
 * 휴대폰에서 입력하다 버튼을 누르면 키보드가 내려가며 창이 움직여, 그 탭이 배경에 떨어지기도 한다.
 */
export function useOverlayClose(onClose: () => void) {
  const fromOverlay = useRef(false)
  return {
    onPointerDown: (e: PointerEvent) => {
      fromOverlay.current = e.target === e.currentTarget
    },
    onClick: (e: MouseEvent) => {
      if (fromOverlay.current && e.target === e.currentTarget) onClose()
      fromOverlay.current = false
    },
    onKeyDown: (e: KeyboardEvent) => e.key === 'Escape' && onClose(),
  }
}
