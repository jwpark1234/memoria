import { useSyncExternalStore } from 'react'

// 글자 크기. 기기별 설정이라 서버가 아닌 localStorage에 둔다. 편집기 글자 기준(px)이고 목록은 이에 맞춰 줄고 는다.

export const FONT_SIZES = [13, 15, 17, 20] as const
export type FontSize = (typeof FONT_SIZES)[number]
export const FONT_SIZE_LABEL: Record<FontSize, string> = { 13: '작게', 15: '보통', 17: '크게', 20: '아주 크게' }

const KEY = 'memoria.fontSize'
// 휴대폰은 화면에 가까이 대고 보지 않아서 한 단계 크게 시작한다
const DEFAULT: FontSize = matchMedia('(pointer: coarse)').matches ? 17 : 15

function load(): FontSize {
  try {
    const n = Number(localStorage.getItem(KEY))
    return FONT_SIZES.includes(n as FontSize) ? (n as FontSize) : DEFAULT
  } catch {
    return DEFAULT
  }
}

let size = load()
const listeners = new Set<() => void>()

// 다른 창(PC 메모 창)에서 바꾼 크기를 바로 따라간다.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return
  size = load()
  applyFontSize()
  listeners.forEach((l) => l())
})

export function useFontSize() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => size,
  )
}

export function setFontSize(s: FontSize) {
  size = s
  try {
    localStorage.setItem(KEY, String(s))
  } catch {
    // 저장이 안 돼도 이번 실행 동안은 적용된다
  }
  applyFontSize()
  listeners.forEach((l) => l())
}

/** 앱 시작 시와 크기가 바뀔 때 */
export const applyFontSize = () => document.documentElement.style.setProperty('--font-size', `${size}px`)
