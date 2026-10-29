import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { app, db, inTauri } from './firebase'

// 휴대폰(PWA) 푸시: 앱이 꺼져 있어도 일정 알림을 받는다.
// 이 기기의 FCM 토큰을 Firestore(users/{uid}/devices)에 올려 두면 Cloudflare Worker(push/)가 1분마다
// 시각이 된 일정을 찾아 푸시를 보내고, 서비스워커(public/sw-notify.js)가 알림을 띄운다.
// PC 앱은 스스로 알리므로(lib/alarms.ts) 등록하지 않는다.

const DEVICE_KEY = 'memoria.deviceId'

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) localStorage.setItem(DEVICE_KEY, (id = crypto.randomUUID()))
    return id
  } catch {
    return 'unknown'
  }
}

/** 푸시를 받을 수 있는 환경인지 (설치한 PWA, 서비스워커, 알림 지원) */
export async function pushSupported(): Promise<boolean> {
  if (inTauri || typeof Notification === 'undefined' || !navigator.serviceWorker) return false
  const { isSupported } = await import('firebase/messaging')
  return isSupported()
}

/** 알림 권한이 있으면 이 기기를 푸시 받을 기기로 등록한다. 토큰이 바뀔 수 있어 앱을 열 때마다 부른다. */
export async function registerPush(uid: string) {
  if (!(await pushSupported()) || Notification.permission !== 'granted') return
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return // 서비스워커가 없는 개발 서버
  // 푸시 기능(firebase/messaging)은 휴대폰에서만 필요해서 따로 불러온다
  const { getMessaging, getToken } = await import('firebase/messaging')
  const token = await getToken(getMessaging(app), { serviceWorkerRegistration: reg })
  if (!token) return
  await setDoc(doc(db, 'users', uid, 'devices', deviceId()), {
    token,
    ua: navigator.userAgent.slice(0, 200),
    updatedAt: serverTimestamp(),
  })
}
