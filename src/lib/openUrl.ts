import { openUrl as tauriOpenUrl } from '@tauri-apps/plugin-opener'
import { inTauri } from './firebase'

/** 링크를 기본 브라우저(PC) 또는 새 탭(PWA)에서 연다 */
export function openUrl(url: string) {
  if (inTauri) tauriOpenUrl(url).catch((e) => console.error('[openUrl]', e))
  else window.open(url, '_blank', 'noopener')
}
