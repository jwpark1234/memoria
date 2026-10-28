import {
  collection,
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

export interface Note {
  id: string
  text: string
  pinned: boolean
  updatedAt: number
}

type NotePatch = Partial<Pick<Note, 'text' | 'pinned'>>

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
            text: data.text ?? '',
            pinned: !!data.pinned,
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
