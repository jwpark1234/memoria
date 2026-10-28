import { invoke } from '@tauri-apps/api/core'
import {
  getRedirectResult,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { auth, inTauri, onHosting } from './firebase'

// 개인용 앱이라 소유자 계정만 받는다. 실제로 막는 건 firestore.rules이고, 여기서는 다른 계정을 바로 내보낸다.
export const OWNER_UID = 'J7jEHxqol0P0FDpXOmYOD4kCKrn1'
export const isOwner = (user: User) => user.uid === OWNER_UID

// 다른 계정이 로그인하면 방금 생긴 그 계정을 Firebase에서 지우고 오류를 낸다.
async function ensureOwner(user: User) {
  if (isOwner(user)) return
  await user.delete().catch(() => fbSignOut(auth))
  throw new Error('이 앱은 소유자 계정으로만 쓸 수 있습니다.')
}

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
    const { user } = await signInWithCredential(auth, GoogleAuthProvider.credential(tokens.idToken, tokens.accessToken))
    await ensureOwner(user)
    return
  }

  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  // 배포된 PWA는 페이지째 구글로 갔다가 같은 도메인으로 돌아온다. 팝업은 모바일(특히 아이폰)에서 막히거나
  // 창 사이 연결이 끊긴다. 개발 서버(localhost)는 처리 페이지가 다른 도메인이라 팝업을 쓴다.
  if (onHosting) await signInWithRedirect(auth, provider)
  else await ensureOwner((await signInWithPopup(auth, provider)).user)
}

/** 구글에서 돌아왔을 때 로그인이 실패했으면 그 오류를 던진다 */
export async function checkRedirectResult() {
  if (!onHosting) return
  const result = await getRedirectResult(auth)
  if (result) await ensureOwner(result.user)
}

export const signOut = () => fbSignOut(auth)
