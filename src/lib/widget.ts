import { invoke } from '@tauri-apps/api/core'
import { currentMonitor, getCurrentWindow, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window'
import { useSyncExternalStore } from 'react'
import { inTauri } from './firebase'
import { noteWindowId, restoreNoteWindows, setNoteWindowsVisible } from './noteWindows'

// 데스크톱 위젯 창 설정 (투명도, 위치 고정, 미니모드). 기기별 설정이라 서버가 아닌 localStorage에 둔다.
// 창은 항상 다른 창 위에 있다 (tauri.conf.json의 alwaysOnTop). 설정은 메인 창에서만 바꾸고, 메모 창은 따라간다.

export const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
export type Corner = (typeof CORNERS)[number]

interface Size {
  width: number
  height: number
}

export interface WidgetSettings {
  opacity: number // 0.3 ~ 1
  fixed: boolean // true면 corner에 붙이고 드래그를 막는다
  corner: Corner
  mini: boolean // 창을 원형 아이콘으로 줄인 상태
  size: Size // 미니모드에서 돌아올 때의 창 크기 (논리 px)
}

export const MIN_OPACITY = 0.3
const KEY = 'memoria.widget'
// 귀퉁이 간격과 미니모드 크기는 옆에 같이 띄워 쓰는 Claude Widget과 맞춘다.
const EDGE_MARGIN = 16 // 화면 가장자리와의 간격 (논리 px)
const NEIGHBOR_GAP = 8 // 같은 귀퉁이의 다른 위젯과의 간격 (논리 px)
const NEIGHBOR_POLL = 1000 // 다른 위젯이 접히거나 펼쳐지는 것을 따라가는 주기 (ms)
export const MINI_SIZE = 60 // 미니모드 창 한 변 (논리 px)
const MIN_SIZE: Size = { width: 260, height: 220 } // tauri.conf.json의 minWidth/minHeight
const DEFAULTS: WidgetSettings = {
  opacity: 1,
  fixed: false,
  corner: 'top-right',
  mini: false,
  size: { width: 400, height: 600 },
}

export const win = inTauri ? getCurrentWindow() : null
/** 데스크톱 메인 위젯 창 (메모 창이 아닌) */
export const mainWindow = win && !noteWindowId ? win : null

function load(): WidgetSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

let settings = load()
const listeners = new Set<() => void>()

// 메모 창: 메인 창에서 바꾼 투명도를 바로 따라간다.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return
  settings = load()
  applyOpacity()
  listeners.forEach((l) => l())
})

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
  if (settings.mini !== prev.mini) applyMini(settings.mini)
  if (settings.fixed && (!prev.fixed || settings.corner !== prev.corner)) snap()
  listeners.forEach((l) => l())
}

const applyOpacity = () => document.documentElement.style.setProperty('--opacity', String(settings.opacity))

interface Rect {
  x: number
  y: number
  width: number
  height: number
} // 물리 px

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

// 현재 모니터 작업 영역(작업표시줄/독 제외)의 모서리에 창을 붙인다.
// 그 자리에 다른 위젯(Claude Widget)이 있으면 겹치지 않게 위쪽 귀퉁이는 그 아래로, 아래쪽 귀퉁이는 그 위로 비켜 선다.
async function snap() {
  const win = mainWindow
  if (!win || !settings.fixed) return
  const monitor = await currentMonitor()
  if (!monitor) return
  const { position: area, size: areaSize } = monitor.workArea
  const size = await win.outerSize()
  const margin = Math.round(EDGE_MARGIN * monitor.scaleFactor)
  const left = settings.corner.endsWith('left')
  const top = settings.corner.startsWith('top')
  const x = left ? area.x + margin : area.x + areaSize.width - size.width - margin
  let y = top ? area.y + margin : area.y + areaSize.height - size.height - margin

  const other = await invoke<Rect | null>('neighbor_widget_rect').catch(() => null)
  if (other && overlaps({ x, y, width: size.width, height: size.height }, other)) {
    const gap = Math.round(NEIGHBOR_GAP * monitor.scaleFactor)
    y = top ? other.y + other.height + gap : other.y - size.height - gap
    y = Math.min(Math.max(y, area.y), area.y + areaSize.height - size.height)
  }

  const now = await win.outerPosition()
  if (now.x !== x || now.y !== y) await win.setPosition(new PhysicalPosition(x, y))
}

// 창 크기를 바꾼다. 미니모드 버튼이 창 오른쪽 위에 있으므로 오른쪽 위 모서리를 기준으로 줄이고 늘리며,
// 늘어난 창이 화면 밖으로 나가지 않게 작업 영역 안으로 당긴다. 위치 고정 중이면 snap이 자리를 잡는다.
async function resizeFromTopRight(size: Size) {
  const win = mainWindow
  if (!win) return
  const before = await win.outerPosition()
  const beforeSize = await win.outerSize()
  await win.setSize(new LogicalSize(size.width, size.height))
  if (settings.fixed) return
  const after = await win.outerSize()
  let x = before.x + beforeSize.width - after.width
  let y = before.y
  const monitor = await currentMonitor()
  if (monitor) {
    const { position: area, size: areaSize } = monitor.workArea
    x = Math.min(Math.max(x, area.x), area.x + areaSize.width - after.width)
    y = Math.min(Math.max(y, area.y), area.y + areaSize.height - after.height)
  }
  await win.setPosition(new PhysicalPosition(x, y))
}

// remember: 지금 창 크기를 미니모드에서 돌아올 크기로 기억할지. 앱 시작 직후에는 설정 파일의 기본 크기라 기억하지 않는다.
async function applyMini(mini: boolean, remember = true) {
  const win = mainWindow
  if (!win) return
  document.documentElement.classList.toggle('mini', mini)
  if (mini) {
    setNoteWindowsVisible(false)
    if (remember) {
      const scale = await win.scaleFactor()
      const size = (await win.outerSize()).toLogical(scale)
      if (size.width >= MIN_SIZE.width && size.height >= MIN_SIZE.height) {
        settings = { ...settings, size: { width: size.width, height: size.height } }
        try {
          localStorage.setItem(KEY, JSON.stringify(settings))
        } catch {
          // 다음 복귀 때 기본 크기를 쓴다
        }
      }
    }
    await win.setResizable(false)
    await win.setShadow(false) // Windows에서 테두리 없는 창의 사각 그림자·테두리가 원 둘레에 보이지 않게
    await win.setMinSize(null)
    await resizeFromTopRight({ width: MINI_SIZE, height: MINI_SIZE })
  } else {
    await win.setMinSize(new LogicalSize(MIN_SIZE.width, MIN_SIZE.height))
    await resizeFromTopRight(settings.size)
    await win.setShadow(true)
    await win.setResizable(true)
    setNoteWindowsVisible(true)
  }
}

/** 앱 시작 시 한 번 호출: 저장된 설정을 창에 적용하고, 크기가 바뀌면 고정 위치를 다시 맞춘다. */
export function initWidget() {
  applyOpacity()
  if (!win) return
  document.documentElement.classList.add('tauri')
  if (!mainWindow) return
  if (settings.mini) applyMini(true, false)
  restoreNoteWindows(settings.mini)
  snap()
  mainWindow.onResized(() => snap())
  mainWindow.onScaleChanged(() => snap())
  setInterval(snap, NEIGHBOR_POLL)
}
