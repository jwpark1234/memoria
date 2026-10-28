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
  fixed: boolean // true면 corner에 붙인다. 끌어서 다른 모니터에 놓으면 그 모니터의 같은 귀퉁이에 붙는다.
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

type Monitor = NonNullable<Awaited<ReturnType<typeof currentMonitor>>>

// 창을 옮기거나 크기를 바꾸는 중, 사용자가 끄는 중에는 귀퉁이 맞추기를 쉰다.
let resizing = false
let dragging = false

// 모니터 작업 영역(작업표시줄/독 제외)의 고정 귀퉁이에 size 크기의 창을 놓을 자리.
// 그 자리에 다른 위젯(Claude Widget)이 있으면 겹치지 않게 위쪽 귀퉁이는 그 아래로, 아래쪽 귀퉁이는 그 위로 비켜 선다.
async function cornerPosition(monitor: Monitor, size: { width: number; height: number }) {
  const { position: area, size: areaSize } = monitor.workArea
  const margin = Math.round(EDGE_MARGIN * monitor.scaleFactor)
  const left = settings.corner.endsWith('left')
  const top = settings.corner.startsWith('top')
  const x = left ? area.x + margin : area.x + areaSize.width - size.width - margin
  let y = top ? area.y + margin : area.y + areaSize.height - size.height - margin

  const other = await invoke<Rect | null>('neighbor_widget_rect').catch(() => null)
  if (other && overlaps({ x, y, ...size }, other)) {
    const gap = Math.round(NEIGHBOR_GAP * monitor.scaleFactor)
    y = top ? other.y + other.height + gap : other.y - size.height - gap
    y = Math.min(Math.max(y, area.y), area.y + areaSize.height - size.height)
  }
  return { x, y }
}

// 위치 고정이면 지금 창이 있는 모니터의 고정 귀퉁이로 옮긴다.
async function snap() {
  const win = mainWindow
  if (!win || !settings.fixed || resizing || dragging) return
  const monitor = await currentMonitor()
  if (!monitor) return
  const { x, y } = await cornerPosition(monitor, await win.outerSize())
  const now = await win.outerPosition()
  if (now.x !== x || now.y !== y) await win.setPosition(new PhysicalPosition(x, y))
}

// 창 크기를 바꾼다. 위치 고정이면 그 귀퉁이에, 아니면 오른쪽 위 모서리를 기준으로(미니모드 버튼이 거기 있다) 줄이고 늘린다.
// 기준 모니터는 바꾸기 전에 창이 있던 모니터다. 키운 뒤에 고르면 커진 창이 걸친 옆 모니터가 잡혀 그쪽으로 넘어간다.
async function resizeTo(size: Size) {
  const win = mainWindow
  if (!win) return
  resizing = true
  try {
    const monitor = await currentMonitor()
    const before = await win.outerPosition()
    const beforeSize = await win.outerSize()
    const scale = monitor?.scaleFactor ?? (await win.scaleFactor())
    const after = { width: Math.round(size.width * scale), height: Math.round(size.height * scale) }

    let pos = { x: before.x + beforeSize.width - after.width, y: before.y }
    if (monitor && settings.fixed) pos = await cornerPosition(monitor, after)
    else if (monitor) {
      const { position: area, size: areaSize } = monitor.workArea
      pos.x = Math.min(Math.max(pos.x, area.x), area.x + areaSize.width - after.width)
      pos.y = Math.min(Math.max(pos.y, area.y), area.y + areaSize.height - after.height)
    }

    // 키울 때는 자리부터 옮기고, 줄일 때는 크기부터 줄여야 중간에 옆 모니터로 걸치지 않는다.
    const grow = after.width > beforeSize.width || after.height > beforeSize.height
    if (grow) await win.setPosition(new PhysicalPosition(pos.x, pos.y))
    await win.setSize(new LogicalSize(size.width, size.height))
    if (!grow) await win.setPosition(new PhysicalPosition(pos.x, pos.y))
  } finally {
    resizing = false
  }
  snap()
}

// 버튼·입력칸이 아닌 곳은 어디를 잡아도 창을 끌 수 있다. 메모 카드는 3px 넘게 움직일 때만 끌기라 클릭과 겹치지 않는다.
const NO_DRAG = 'input, textarea, select, [contenteditable], button:not(.card), .segment, .corners, .menu, .overlay'
const DRAG_THRESHOLD = 3 // px
const DRAG_CHECK = 150 // 끌기가 끝났는지(버튼을 놓았는지) 확인하는 주기 (ms)

function enableDrag(win: NonNullable<typeof mainWindow>) {
  let start: { x: number; y: number } | null = null

  // 끈 뒤 버튼을 놓으면, 위치 고정일 때 놓은 모니터의 고정 귀퉁이로 붙는다.
  const finish = () => {
    dragging = false
    snap()
  }
  const watch = async () => {
    if (!dragging) return
    if (await invoke<boolean>('mouse_left_down').catch(() => false)) window.setTimeout(watch, DRAG_CHECK)
    else finish()
  }

  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || (e.target as Element).closest(NO_DRAG)) return
    start = { x: e.screenX, y: e.screenY }
  })
  document.addEventListener('mousemove', (e) => {
    // OS의 창 끌기가 끝나면 웹뷰는 mouseup을 못 받는다. 버튼이 떼어진 채 움직이면 끝난 것이다.
    if (dragging && e.buttons === 0) return finish()
    if (!start || Math.abs(e.screenX - start.x) + Math.abs(e.screenY - start.y) <= DRAG_THRESHOLD) return
    start = null
    dragging = true
    win.startDragging()
    window.setTimeout(watch, DRAG_CHECK)
  })
  document.addEventListener('mouseup', () => (start = null))
}

// remember: 지금 창 크기를 미니모드에서 돌아올 크기로 기억할지. 앱 시작 직후에는 설정 파일의 기본 크기라 기억하지 않는다.
// 창 크기가 바뀌는 동안에는 화면을 가린다. 안 그러면 큰 창에 원형 아이콘이 크게 그려졌다가(또는 메모 화면이 60px에 구겨졌다가) 바뀐다.
async function applyMini(mini: boolean, remember = true) {
  const win = mainWindow
  if (!win) return
  const root = document.documentElement
  root.classList.add('switching')
  try {
    await resizeForMini(win, mini, remember)
  } finally {
    root.classList.toggle('mini', mini)
    // 새 크기로 한 번 그려진 뒤에 보여준다
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    root.classList.remove('switching')
  }
}

async function resizeForMini(win: NonNullable<typeof mainWindow>, mini: boolean, remember: boolean) {
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
    await resizeTo({ width: MINI_SIZE, height: MINI_SIZE })
  } else {
    await win.setMinSize(new LogicalSize(MIN_SIZE.width, MIN_SIZE.height))
    await resizeTo(settings.size)
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
  enableDrag(mainWindow)
  if (settings.mini) applyMini(true, false)
  restoreNoteWindows(settings.mini)
  snap()
  mainWindow.onResized(() => snap())
  mainWindow.onScaleChanged(() => snap())
  setInterval(snap, NEIGHBOR_POLL)
}
