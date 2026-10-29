import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { useEffect, useRef, useState } from 'react'
import { inTauri } from './firebase'
import { noteTitle } from './markup'
import type { Note } from './notes'
import { formatWhen, updateSchedule, type Schedule } from './schedules'

// 일정 알림. 앱이 떠 있는 동안 다음 일정 시각에 맞춰 깨어나 OS 알림을 띄운다.
// PC는 트레이에 숨어 있어도 돌아간다. 휴대폰(PWA)은 앱이 화면에 있을 때 여기서 알리고,
// 앱이 꺼져 있을 때는 Cloudflare Worker(push/)가 푸시를 보낸다 (lib/push.ts).

// 브라우저 타이머는 너무 먼 시각을 못 받고, PC가 잠들었다 깨면 어긋나므로 이 주기로 다시 계산한다.
const MAX_WAIT = 10 * 60_000

const webNotify = typeof Notification !== 'undefined'

/** 알림 권한을 묻는다. 휴대폰 브라우저는 버튼을 누른 직후에만 물을 수 있어서 일정을 저장할 때 부른다. */
export async function askNotifyPermission() {
  if (inTauri) {
    if (!(await isPermissionGranted())) await requestPermission()
  } else if (webNotify && Notification.permission === 'default') {
    await Notification.requestPermission()
  }
}

// tag: 같은 일정의 알림은 하나로 합친다. 푸시(push/src/index.ts)도 일정 id를 tag로 써서 겹쳐 뜨지 않는다.
async function notify(title: string, body: string, tag: string) {
  if (inTauri) {
    if (await isPermissionGranted()) sendNotification({ title, body })
    return
  }
  if (!webNotify || Notification.permission !== 'granted') return
  // 휴대폰은 서비스워커로만 알림을 띄울 수 있다. 서비스워커가 없는 개발 서버에서는 바로 띄운다.
  const reg = await navigator.serviceWorker?.getRegistration()
  if (reg) await reg.showNotification(title, { body, icon: '/pwa-192x192.png', tag })
  else new Notification(title, { body, tag })
}

/** 메인 창(PWA는 앱)에서 한 번만 쓴다. 메모 창이 따로 알리면 겹친다. */
export function useAlarms(uid: string, schedules: Schedule[], notes: Note[]) {
  const [tick, setTick] = useState(0)
  // 서버에 notified가 반영되기 전에 같은 일정을 또 알리지 않게 기억한다 (일정 id → 알린 시각)
  const fired = useRef(new Map<string, number>())

  useEffect(() => {
    const now = Date.now()
    let next = Infinity
    for (const s of schedules) {
      if (s.done || s.notified || fired.current.get(s.id) === s.at) continue
      if (s.at > now) {
        next = Math.min(next, s.at)
        continue
      }
      fired.current.set(s.id, s.at)
      const note = s.noteId ? notes.find((n) => n.id === s.noteId) : undefined
      const where = note && noteTitle(note)
      notify(s.title || '일정', [formatWhen(s.at), where].filter(Boolean).join(' · '), s.id).catch((e) =>
        console.error('[alarms]', e),
      )
      updateSchedule(uid, s.id, { notified: true })
    }
    if (next === Infinity) return
    const timer = window.setTimeout(() => setTick((t) => t + 1), Math.min(next - now, MAX_WAIT))
    return () => window.clearTimeout(timer)
  }, [uid, schedules, notes, tick])

  // 휴대폰에서 앱으로 돌아오면 그동안 지난 일정을 바로 알린다
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && setTick((t) => t + 1)
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
}
