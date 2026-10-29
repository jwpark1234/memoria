import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from './firebase'
import { encryptNote } from './lock'

export interface Note {
  id: string
  title: string // 따로 적은 제목. 비어 있으면 내용의 첫 줄을 제목으로 보여준다.
  text: string
  pinned: boolean
  updatedAt: number
  // 잠금 메모 (lib/lock.ts): 본문은 cipher에 암호화돼 있고 text는 비어 있다. 제목은 암호화하지 않는다.
  // useDecrypted를 거치면 풀린 본문이 text에 들어가고, 풀 수 없으면 sealed가 선다.
  locked: boolean
  cipher: string | null
  sealed?: boolean
}

type NotePatch = Partial<Pick<Note, 'title' | 'text' | 'pinned'>>

const notesCol = (uid: string) => collection(db, 'users', uid, 'notes')

// 쓰기는 await하지 않는다. 로컬 캐시에 즉시 반영되고, 서버 확인은 onSnapshot의 hasPendingWrites로 본다.
const report = (e: unknown) => console.error('[notes]', e)

export function useNotes(uid: string) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loaded, setLoaded] = useState(false)
  const [pending, setPending] = useState(false)
  const [fromServer, setFromServer] = useState(false)

  useEffect(() => {
    const q = query(notesCol(uid), where('deleted', '==', false))
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data({ serverTimestamps: 'estimate' })
          return {
            id: d.id,
            title: data.title ?? '',
            text: data.text ?? '',
            pinned: !!data.pinned,
            locked: !!data.locked,
            cipher: data.cipher ?? null,
            updatedAt: (data.updatedAt as Timestamp | null)?.toMillis() ?? Date.now(),
          } satisfies Note
        })
        list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
        setNotes(list)
        setLoaded(true)
        setPending(snap.metadata.hasPendingWrites)
        setFromServer(!snap.metadata.fromCache)
      },
      report,
    )
  }, [uid])

  // fromServer: 서버와 맞춰 본 목록인지. 캐시만 본 상태에서는 "없는 메모"라고 단정하지 않는다.
  return { notes, loaded, pending, fromServer }
}

export function createNote(uid: string): string {
  const ref = doc(notesCol(uid))
  setDoc(ref, {
    text: '',
    pinned: false,
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }).catch(report)
  return ref.id
}

export function updateNote(uid: string, id: string, patch: NotePatch) {
  updateDoc(doc(notesCol(uid), id), { ...patch, updatedAt: serverTimestamp() }).catch(report)
}

// 바로 지우지 않고 플래그만 세워서, 오프라인이던 다른 기기와 꼬이지 않게 한다.
export function deleteNote(uid: string, id: string) {
  updateDoc(doc(notesCol(uid), id), { deleted: true, updatedAt: serverTimestamp() }).catch(report)
}

// 잠금 메모 쓰기는 암호화를 기다리느라 순서가 뒤바뀔 수 있어서 한 줄로 세운다.
// (예: 암호문 저장이 늦게 끝나 방금 푼 잠금을 다시 덮으면 안 된다)
let lockedWrites: Promise<unknown> = Promise.resolve()
const inOrder = (job: () => Promise<void>) => (lockedWrites = lockedWrites.then(job, job))

/** 잠금 메모의 본문을 암호화해서 저장한다 (제목은 그대로 updateNote로) */
export function updateLockedNote(uid: string, id: string, text: string) {
  // 키는 지금 잡는다 (lib/lock.ts의 encryptNote). 쓰기만 순서대로 한다.
  const sealing = encryptNote(id, text)
  return inOrder(async () => {
    const cipher = await sealing
    updateDoc(doc(notesCol(uid), id), { cipher, text: '', updatedAt: serverTimestamp() }).catch(report)
  })
}

/** 메모를 잠그거나 잠금을 푼다. 잠글 때는 본문을 암호문으로 바꾸고 원문을 지운다. */
export function setNoteLocked(uid: string, id: string, locked: boolean, text: string) {
  const ref = doc(notesCol(uid), id)
  const sealing = locked ? encryptNote(id, text) : null
  return inOrder(async () => {
    if (sealing) {
      const cipher = await sealing
      updateDoc(ref, { locked: true, cipher, text: '', updatedAt: serverTimestamp() }).catch(report)
    } else {
      updateDoc(ref, { locked: false, cipher: deleteField(), text, updatedAt: serverTimestamp() }).catch(report)
    }
  })
}
