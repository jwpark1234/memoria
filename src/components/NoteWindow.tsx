import { onAuthStateChanged, type User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { isOwner } from '../lib/auth'
import { auth } from '../lib/firebase'
import { closeNoteWindow, noteWindowId, trackNoteWindow } from '../lib/noteWindows'
import { useNotes } from '../lib/notes'
import { NoteEditor } from './NoteEditor'

const noop = () => {}

/** PC에서 따로 띄운 메모 창 하나. 로그아웃되거나 메모가 지워지면 스스로 닫힌다. */
export function NoteWindow() {
  // undefined = 아직 로그인 상태 확인 중
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u && isOwner(u) ? u : null)), [])
  useEffect(() => trackNoteWindow(), [])
  useEffect(() => {
    if (user === null) closeNoteWindow()
  }, [user])

  return <div className="app note-window">{user && <Body uid={user.uid} id={noteWindowId!} />}</div>
}

function Body({ uid, id }: { uid: string; id: string }) {
  const { notes, fromServer } = useNotes(uid)
  const note = notes.find((n) => n.id === id)

  useEffect(() => {
    if (fromServer && !note) closeNoteWindow()
  }, [fromServer, note])

  if (!note) return null
  return <NoteEditor key={note.id} uid={uid} note={note} onBack={closeNoteWindow} onTyping={noop} standalone />
}
