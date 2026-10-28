import { useSyncExternalStore } from 'react'

// 화면 테마. 기기별 설정이라 서버가 아닌 localStorage에 둔다. system이면 OS 설정을 따른다.

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

const KEY = 'memoria.theme'
const BG = { light: '#fbfaf7', dark: '#1c1c1e' }

function load(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    return THEMES.includes(t as Theme) ? (t as Theme) : 'system'
  } catch {
    return 'system'
  }
}

let theme = load()
const listeners = new Set<() => void>()

export function useTheme() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => theme,
  )
}

export function setTheme(t: Theme) {
  theme = t
  try {
    localStorage.setItem(KEY, t)
  } catch {
    // 저장이 안 돼도 이번 실행 동안은 적용된다
  }
  applyTheme()
  listeners.forEach((l) => l())
}

/** 앱 시작 시와 테마가 바뀔 때: html의 data-theme과 상태바 색(theme-color)을 맞춘다. */
export function applyTheme() {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme

  // index.html의 theme-color는 라이트/다크 두 개다. 직접 고른 테마면 둘 다 그 색으로 맞춘다.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light'
    meta.content = BG[theme === 'system' ? scheme : theme]
  })
}
