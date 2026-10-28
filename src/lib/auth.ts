import { invoke } from '@tauri-apps/api/core'
import {
  getRedirectResult,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
} from 'firebase/auth'
import { auth, inTauri, onHosting } from './firebase'

interface GoogleTokens {
  idToken: string
  accessToken: string
}

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
  // 배포된 PWA는 페이지째 구글로 갔다가 같은 도메인으로 돌아온다. 팝업은 모바일(특히 아이폰)에서 막히거나
  // 창 사이 연결이 끊긴다. 개발 서버(localhost)는 처리 페이지가 다른 도메인이라 팝업을 쓴다.
  if (onHosting) await signInWithRedirect(auth, provider)
  else await signInWithPopup(auth, provider)
}

/** 구글에서 돌아왔을 때 로그인이 실패했으면 그 오류를 던진다 */
export async function checkRedirectResult() {
  if (onHosting) await getRedirectResult(auth)
}

export const signOut = () => fbSignOut(auth)
