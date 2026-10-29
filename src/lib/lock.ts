import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { db } from './firebase'
import type { Note } from './notes'

// 잠금 메모: 본문을 기기 안에서 암호화해서 올린다. 서버(Google), 푸시 Worker, 서비스 계정 키로는 읽을 수 없다.
// 제목은 목록에서 메모를 구분하도록 암호화하지 않는다 (아이폰 메모와 같다). 비워 두면 "잠긴 메모"로 보인다.
//
// - 잠금 암호는 설정에서 정한다. 메모를 열 때, 잠글 때, 잠금을 풀 때마다 묻는다. 암호 자체는 어디에도 저장하지 않는다.
// - 본문은 무작위 데이터 키(AES-256-GCM)로 암호화한다. 메모 id를 추가 인증 데이터로 넣어 다른 메모 자리로 옮겨 붙일 수 없다.
// - 데이터 키는 잠금 암호에서 만든 키(PBKDF2-SHA256)로 감싸 users/{uid}/meta/lock에 둔다.
//   암호가 틀리면 풀리지 않으므로(GCM 인증 실패) 따로 확인용 값이 필요 없고, 암호를 바꿀 때는 데이터 키만 다시 감싼다.
// - 암호를 잊으면 잠긴 메모는 되살릴 수 없다.
// - 푼 데이터 키는 이 창의 메모리에만 있고, 메모를 닫거나 앱을 떠나면 지운다.

export interface LockMeta {
  salt: string
  iter: number
  iv: string
  wrapped: string
}

const ITERATIONS = 600_000
const AWAY_LOCK_MS = 60_000 // PC: 다른 창을 이만큼 쓰고 있으면 잠근다

let key: CryptoKey | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

// 푼 본문: 암호문 → 본문. 잠그면 비운다.
const plain = new Map<string, string>()
// 메모별 마지막으로 푼 본문 (다른 기기에서 고친 새 암호문을 푸는 동안 보여준다)
const lastById = new Map<string, string>()

/** 지금 잠금이 풀려 있는지 (잠금 메모 하나를 열어 둔 동안) */
export function useUnlocked() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => key !== null,
  )
}

const metaRef = (uid: string) => doc(db, 'users', uid, 'meta', 'lock')

/** 잠금 암호 정보. undefined = 불러오는 중, null = 아직 암호를 정하지 않음 */
export function useLockMeta(uid: string): LockMeta | null | undefined {
  const [meta, setMeta] = useState<LockMeta | null>()
  useEffect(() => {
    if (!uid) return // 로그인 전 (설정 패널은 로그인 화면에도 있다)
    return onSnapshot(
      metaRef(uid),
      (snap) => setMeta(snap.exists() ? (snap.data() as LockMeta) : null),
      (e) => console.error('[lock]', e),
    )
  }, [uid])
  return meta
}

// ── 암호화 ──────────────────────────────────────────────────────────────

const enc = new TextEncoder()
const dec = new TextDecoder()
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))
const b64 = (data: ArrayBuffer | Uint8Array) => {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function passKey(pass: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

// 데이터 키를 암호로 감싸 저장한다. 쓰기는 기다리지 않는다 (오프라인이면 서버 확인을 끝없이 기다린다).
async function saveWrapped(uid: string, dataKey: CryptoKey, pass: string) {
  const salt = random(16)
  const iv = random(12)
  const wrapped = await crypto.subtle.wrapKey('raw', dataKey, await passKey(pass, salt, ITERATIONS), { name: 'AES-GCM', iv })
  const meta: LockMeta = { salt: b64(salt), iter: ITERATIONS, iv: b64(iv), wrapped: b64(wrapped) }
  setDoc(metaRef(uid), { ...meta, updatedAt: serverTimestamp() }).catch((e) => console.error('[lock]', e))
}

async function unwrap(meta: LockMeta, pass: string, extractable: boolean): Promise<CryptoKey | null> {
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      unb64(meta.wrapped),
      await passKey(pass, unb64(meta.salt), meta.iter),
      { name: 'AES-GCM', iv: unb64(meta.iv) },
      { name: 'AES-GCM', length: 256 },
      extractable,
      ['encrypt', 'decrypt'],
    )
  } catch {
    return null
  }
}

/** 설정: 처음 잠금 암호를 정한다 */
export async function setupLock(uid: string, pass: string) {
  const dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  await saveWrapped(uid, dataKey, pass)
}

/** 설정: 잠금 암호를 바꾼다. 지금 암호가 틀리면 false. 잠긴 메모는 다시 암호화하지 않아도 된다. */
export async function changeLock(uid: string, meta: LockMeta, oldPass: string, newPass: string): Promise<boolean> {
  const dataKey = await unwrap(meta, oldPass, true)
  if (!dataKey) return false
  await saveWrapped(uid, dataKey, newPass)
  return true
}

/** 잠금을 푼다 (잠금 메모를 열거나, 잠그거나, 잠금을 풀기 전). 암호가 틀리면 false */
export async function unlock(meta: LockMeta, pass: string): Promise<boolean> {
  const k = await unwrap(meta, pass, false)
  if (!k) return false
  key = k
  emit()
  return true
}

/** 바로 잠근다 */
export function lockNow() {
  if (!key) return
  key = null
  plain.clear()
  lastById.clear()
  window.clearTimeout(awayTimer)
  emit()
}

/**
 * 본문을 암호화한다. 풀린 상태에서만 된다.
 * 키는 부른 순간에 잡는다. 저장하고 바로 잠그는 경우(메모를 닫음, 앱을 떠남)에도 이미 부른 저장은 끝까지 간다.
 */
export function encryptNote(id: string, text: string): Promise<string> {
  const k = key
  if (!k) return Promise.reject(new Error('잠금 메모를 저장하려면 잠금을 풀어야 합니다'))
  return (async () => {
    const iv = random(12)
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(id) }, k, enc.encode(text))
    const cipher = b64(new Uint8Array([...iv, ...new Uint8Array(ct)]))
    // 방금 쓴 본문은 다시 풀지 않고 바로 보여준다 (편집기가 잠깐이라도 잠긴 화면으로 바뀌지 않게)
    if (key === k) plain.set(cipher, text)
    return cipher
  })()
}

async function decryptNote(id: string, cipher: string): Promise<string> {
  const k = key
  if (!k) throw new Error('locked')
  const bytes = unb64(cipher)
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: enc.encode(id) },
    k,
    bytes.subarray(12),
  )
  return dec.decode(pt)
}

/**
 * 잠금 메모의 본문을 풀어서 돌려준다. 풀 수 없으면(잠긴 상태) 본문을 비우고 sealed를 세운다.
 * 다른 기기에서 고친 암호문을 푸는 동안에는 바로 전 본문을 그대로 보여준다.
 */
export function useDecrypted(notes: Note[]): Note[] {
  const unlocked = useUnlocked()
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!unlocked) return
    let alive = true
    for (const n of notes) {
      const cipher = n.cipher
      if (!n.locked || !cipher || plain.has(cipher)) continue
      decryptNote(n.id, cipher).then(
        (text) => {
          if (!key) return
          plain.set(cipher, text)
          lastById.set(n.id, text)
          if (alive) setVersion((v) => v + 1)
        },
        (e) => console.error('[lock] 풀 수 없는 메모', n.id, e),
      )
    }
    return () => {
      alive = false
    }
  }, [notes, unlocked])

  return useMemo(
    () =>
      notes.map((n) => {
        if (!n.locked) return n
        const text = unlocked ? ((n.cipher && plain.get(n.cipher)) ?? lastById.get(n.id)) : undefined
        if (text !== undefined) lastById.set(n.id, text)
        return text !== undefined ? { ...n, text } : { ...n, text: '', sealed: true }
      }),
    // version: 새로 푼 본문을 반영한다
    [notes, unlocked, version],
  )
}

// ── 떠나면 잠그기 ───────────────────────────────────────────────────────
// 앱이 백그라운드로 가거나(휴대폰), 트레이·미니모드로 숨으면(PC) 바로 잠근다.
// PC에서 다른 창을 1분 넘게 쓰고 있어도 잠근다.
// 바로 잠글 때도 한 박자 늦춘다: 같은 순간에 편집기가 하는 저장(visibilitychange)이 먼저 키를 잡게.

let awayTimer: number | undefined

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') window.setTimeout(lockNow)
})
window.addEventListener('blur', () => {
  window.clearTimeout(awayTimer)
  if (key) awayTimer = window.setTimeout(lockNow, AWAY_LOCK_MS)
})
window.addEventListener('focus', () => window.clearTimeout(awayTimer))
