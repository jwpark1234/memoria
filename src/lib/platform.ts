import { inTauri } from './firebase'

/**
 * macOS 데스크톱 앱인가. 맞으면 html.mac을 붙여서 macOS 모양(왼쪽 신호등 버튼, 가운데 제목, 둥근 창 모서리)으로 그린다.
 * 개발할 때 Windows에서 macOS 모양을 보려면 VITE_LOOK=mac 으로 띄운다.
 */
export const macDesktop =
  inTauri && (/Macintosh|Mac OS X/.test(navigator.userAgent) || (import.meta.env.DEV && import.meta.env.VITE_LOOK === 'mac'))

/** 앱 시작 시 한 번: html.mac을 붙이고, 창이 포커스를 잃으면 html.inactive (신호등이 회색이 된다) */
export function initPlatform() {
  if (!macDesktop) return
  const root = document.documentElement
  root.classList.add('mac')
  const sync = () => root.classList.toggle('inactive', !document.hasFocus())
  window.addEventListener('focus', sync)
  window.addEventListener('blur', sync)
  sync()
}
