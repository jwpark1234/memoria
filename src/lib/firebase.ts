import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

export const inTauri = '__TAURI_INTERNALS__' in window

// Firebase Hosting에서 열린 PWA. 로그인 처리 페이지(/__/auth/handler)도 같은 도메인 것을 쓴다.
// 다른 도메인(firebaseapp.com)을 쓰면 브라우저의 서드파티 저장소 차단 때문에 구글에서 돌아와도 로그인 결과를 못 받는다.
export const onHosting = !inTauri && /\.(web\.app|firebaseapp\.com)$/.test(location.hostname)

// macOS/Linux 데스크톱은 WebKit 웹뷰다(Windows는 Chromium 기반 WebView2).
const webkitDesktop = inTauri && !/Chrome|Edg/.test(navigator.userAgent)

const env = import.meta.env

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: onHosting ? location.hostname : env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})

// Tauri에서는 팝업/리다이렉트 로그인을 쓰지 않으므로 resolver를 싣지 않는다.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  popupRedirectResolver: inTauri ? undefined : browserPopupRedirectResolver,
})

// 오프라인 캐시: 쓰기는 즉시 로컬에 반영되고 서버 동기화는 뒤에서 이뤄진다.
// WebKit 웹뷰에서는 Firestore의 스트리밍 연결이 동작하지 않아 쓰기가 서버 확인을 끝없이 기다린다("업로드 중"에서 멈춤).
// 그래서 거기서만 long polling으로 연결한다.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ...(webkitDesktop && { experimentalForceLongPolling: true }),
})
