import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { inTauri } from './firebase'

// PC에서 메모를 따로 띄운 창들. 포스트잇처럼 여러 개를 동시에 펼쳐 둔다.
// 어떤 메모가 열려 있었는지와 창 위치·크기는 기기별로 localStorage에 두고, 다음 실행 때 다시 연다.

interface Geometry {
  x: number
  y: number
  width: number
  height: number
} // 논리 px

const KEY = 'memoria.noteWindows'
const DEFAULT_SIZE = { width: 300, height: 340 }
const GAP = 12 // 메인 창과의 간격

const label = (id: string) => `note-${id}`

/** 메모 창이면 그 메모 id, 메인 창이면 null */
export const noteWindowId = inTauri ? new URLSearchParams(location.search).get('note') : null

function load(): Record<string, Geometry | null> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

function save(patch: Record<string, Geometry | null | undefined>) {
  const all = { ...load(), ...patch }
  for (const id of Object.keys(all)) if (all[id] === undefined) delete all[id]
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // 다음 실행 때 다시 열지 못할 뿐이다
  }
}

// 처음 띄우는 메모는 메인 창 왼쪽(자리가 없으면 오른쪽)에, 열린 개수만큼 조금씩 어긋나게 놓는다.
async function defaultPosition(): Promise<{ x: number; y: number }> {
  const main = getCurrentWindow()
  const scale = await main.scaleFactor()
  const pos = (await main.outerPosition()).toLogical(scale)
  const size = (await main.outerSize()).toLogical(scale)
  const offset = (Object.keys(load()).length % 8) * 24
  const left = pos.x - DEFAULT_SIZE.width - GAP
  return { x: left >= 0 ? left - offset : pos.x + size.width + GAP + offset, y: pos.y + offset }
}

/** 메인 창에서 호출. 이미 열려 있으면 앞으로 가져온다. */
export async function openNoteWindow(id: string, hidden = false) {
  const existing = await WebviewWindow.getByLabel(label(id))
  if (existing) {
    await existing.show()
    await existing.setFocus()
    return
  }
  const geometry = load()[id] ?? { ...DEFAULT_SIZE, ...(await defaultPosition()) }
  save({ [id]: geometry })
  new WebviewWindow(label(id), {
    url: `index.html?note=${encodeURIComponent(id)}`,
    title: 'Memoria',
    ...geometry,
    minWidth: 200,
    minHeight: 140,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    visible: !hidden,
  })
}

/** 앱 시작 시 메인 창에서 호출: 지난번에 열려 있던 메모 창을 다시 연다. */
export function restoreNoteWindows(hidden: boolean) {
  for (const id of Object.keys(load())) openNoteWindow(id, hidden)
}

/** 미니모드: 메모 창을 모두 숨기거나 다시 보여준다. */
export async function setNoteWindowsVisible(visible: boolean) {
  for (const id of Object.keys(load())) {
    const w = await WebviewWindow.getByLabel(label(id))
    if (w) await (visible ? w.show() : w.hide())
  }
}

/** 메모 창에서 호출: 이 창을 닫고 다음 실행 때 다시 열지 않는다. */
export function closeNoteWindow() {
  if (!noteWindowId) return
  save({ [noteWindowId]: undefined })
  getCurrentWindow().close()
}

/** 메모 창에서 호출: 옮기거나 크기를 바꾸면 기억해 둔다. */
export function trackNoteWindow() {
  if (!noteWindowId) return
  const id = noteWindowId
  const win = getCurrentWindow()
  let timer: number | undefined
  const store = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(async () => {
      if (!(id in load())) return // 이미 닫는 중
      const scale = await win.scaleFactor()
      const pos = (await win.outerPosition()).toLogical(scale)
      const size = (await win.outerSize()).toLogical(scale)
      save({ [id]: { x: pos.x, y: pos.y, width: size.width, height: size.height } })
    }, 300)
  }
  win.onMoved(store)
  win.onResized(store)
}
