import { useSyncExternalStore } from 'react'
import { inTauri } from './firebase'

// 새 버전 알림. 데스크톱은 GitHub Releases의 latest.json(Tauri updater)을, PWA는 새 서비스워커를 확인한다.
// 찾으면 제목 옆에 업데이트 버튼이 나타나고, 누르면 설치한 뒤 다시 시작한다.

export interface UpdateInfo {
  available: boolean
  version: string // 데스크톱만 알 수 있다
  installing: boolean
}

const CHECK_INTERVAL = 60 * 60 * 1000 // 1시간

let info: UpdateInfo = { available: false, version: '', installing: false }
let install: (() => Promise<void>) | null = null
const listeners = new Set<() => void>()

function set(patch: Partial<UpdateInfo>) {
  info = { ...info, ...patch }
  listeners.forEach((l) => l())
}

export function useUpdate() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => info,
  )
}

export async function applyUpdate() {
  if (!install || info.installing) return
  set({ installing: true })
  try {
    await install()
  } catch (e) {
    console.error('[update]', e)
    set({ installing: false })
  }
}

async function checkDesktop() {
  if (info.available) return
  const { check } = await import('@tauri-apps/plugin-updater')
  const update = await check()
  if (!update) return
  install = async () => {
    // Windows는 설치 프로그램이 앱을 종료하고 다시 띄운다. macOS/Linux는 직접 다시 시작한다.
    await update.downloadAndInstall()
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
  }
  set({ available: true, version: update.version })
}

async function initPwa() {
  const { registerSW } = await import('virtual:pwa-register')
  const updateSW = registerSW({
    onNeedRefresh() {
      install = () => updateSW(true)
      set({ available: true })
    },
    // 휴대폰에서는 앱을 오래 켜 두고 오가므로, 주기적으로 그리고 다시 볼 때마다 새 버전을 확인한다.
    onRegisteredSW(_url, reg) {
      if (!reg) return
      const recheck = () => reg.update().catch(() => {}) // 오프라인이면 다음 기회에
      setInterval(recheck, CHECK_INTERVAL)
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && recheck())
    },
  })
}

/** 앱 시작 시 한 번 호출. 개발 중에는 확인하지 않는다. */
export function initUpdate() {
  if (import.meta.env.DEV) return
  if (inTauri) {
    const recheck = () => checkDesktop().catch((e) => console.warn('[update]', e)) // 오프라인이면 다음 기회에
    recheck()
    setInterval(recheck, CHECK_INTERVAL)
  } else {
    initPwa()
  }
}
