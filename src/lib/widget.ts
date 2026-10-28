import { currentMonitor, getCurrentWindow, PhysicalPosition } from '@tauri-apps/api/window'
import { useSyncExternalStore } from 'react'
import { inTauri } from './firebase'

// 데스크톱 위젯 창 설정 (투명도, 위치 고정, 항상 위). 기기별 설정이라 서버가 아닌 localStorage에 둔다.

export const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
export type Corner = (typeof CORNERS)[number]

export interface WidgetSettings {
  opacity: number // 0.3 ~ 1
  fixed: boolean // true면 corner에 붙이고 드래그를 막는다
  corner: Corner
  onTop: boolean
}

export const MIN_OPACITY = 0.3
const KEY = 'memoria.widget'
const EDGE_MARGIN = 8 // 화면 가장자리와의 간격 (논리 px)
const DEFAULTS: WidgetSettings = { opacity: 1, fixed: false, corner: 'top-right', onTop: true }

export const win = inTauri ? getCurrentWindow() : null

function load(): WidgetSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

let settings = load()
const listeners = new Set<() => void>()

export function useWidget() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => settings,
  )
}

export function setWidget(patch: Partial<WidgetSettings>) {
  const prev = settings
  settings = { ...settings, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // 저장이 안 돼도 이번 실행 동안은 적용된다
  }
  if (settings.opacity !== prev.opacity) applyOpacity()
  if (settings.onTop !== prev.onTop) win?.setAlwaysOnTop(settings.onTop)
  if (settings.fixed && (!prev.fixed || settings.corner !== prev.corner)) snap()
  listeners.forEach((l) => l())
}

const applyOpacity = () => document.documentElement.style.setProperty('--opacity', String(settings.opacity))

// 현재 모니터 작업 영역(작업표시줄/독 제외)의 모서리에 창을 붙인다.
async function snap() {
  if (!win || !settings.fixed) return
  const monitor = await currentMonitor()
  if (!monitor) return
  const { position: area, size: areaSize } = monitor.workArea
  const size = await win.outerSize()
  const margin = Math.round(EDGE_MARGIN * monitor.scaleFactor)
  const left = settings.corner.endsWith('left')
  const top = settings.corner.startsWith('top')
  const x = left ? area.x + margin : area.x + areaSize.width - size.width - margin
  const y = top ? area.y + margin : area.y + areaSize.height - size.height - margin
  await win.setPosition(new PhysicalPosition(x, y))
}

/** 앱 시작 시 한 번 호출: 저장된 설정을 창에 적용하고, 크기가 바뀌면 고정 위치를 다시 맞춘다. */
export function initWidget() {
  applyOpacity()
  if (!win) return
  document.documentElement.classList.add('tauri')
  win.setAlwaysOnTop(settings.onTop)
  snap()
  win.onResized(() => snap())
  win.onScaleChanged(() => snap())
}
