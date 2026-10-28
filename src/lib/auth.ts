import { invoke } from '@tauri-apps/api/core'
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
} from 'firebase/auth'
import { auth, inTauri } from './firebase'

interface GoogleTokens {
  idToken: string
  accessToken: string
}

// 홈 화면에 추가된 iOS PWA는 팝업이 불안정해서 리다이렉트를 쓴다.
const isIOSStandalone = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export async function signIn() {
  if (inTauri) {
    // 시스템 브라우저에서 OAuth를 끝내고 받은 토큰으로 Firebase에 로그인한다 (src-tauri/src/oauth.rs).
    const tokens = await invoke<GoogleTokens>('google_sign_in', {
      clientId: import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID,
      clientSecret: import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_SECRET,
    })
    await signInWithCredential(auth, GoogleAuthProvider.credential(tokens.idToken, tokens.accessToken))
    return
  }

  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  if (isIOSStandalone()) await signInWithRedirect(auth, provider)
  else await signInWithPopup(auth, provider)
}

export const signOut = () => fbSignOut(auth)
