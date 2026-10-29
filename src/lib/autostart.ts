import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { useEffect, useState } from 'react'
import { mainWindow } from './widget'

// PC에 로그인하면 위젯을 자동으로 띄운다. 처음 실행할 때 한 번 켜 두고, 이후는 설정 패널에서 바꾼다.
// 켜고 끈 상태는 OS(Windows 레지스트리, macOS LaunchAgent)가 기억한다.

const INIT_KEY = 'memoria.autostartInit'

/** 앱 시작 시 메인 창에서 한 번 */
export function initAutostart() {
  // 개발 빌드를 자동 실행에 등록하지 않는다
  if (!mainWindow || import.meta.env.DEV) return
  try {
    if (localStorage.getItem(INIT_KEY)) return
    localStorage.setItem(INIT_KEY, '1')
  } catch {
    return
  }
  enable().catch((e) => console.error('[autostart]', e))
}

/** 설정 패널: [켜짐 여부(확인 전엔 undefined), 바꾸기] */
export function useAutostart() {
  const [on, setOn] = useState<boolean>()
  useEffect(() => {
    isEnabled().then(setOn, () => setOn(false))
  }, [])
  const set = async (next: boolean) => {
    await (next ? enable() : disable()).catch((e) => console.error('[autostart]', e))
    setOn(await isEnabled().catch(() => next))
  }
  return [on, set] as const
}
