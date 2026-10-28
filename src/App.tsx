import { onAuthStateChanged, type User } from 'firebase/auth'
import { useCallback, useEffect, useState } from 'react'
import { Icon } from './components/Icon'
import { Login } from './components/Login'
import { NoteEditor } from './components/NoteEditor'
import { NoteList } from './components/NoteList'
import { StatusBar, type SyncStatus } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import { signOut } from './lib/auth'
import { auth } from './lib/firebase'
import { formatDate } from './lib/formatDate'
import { createNote, useNotes } from './lib/notes'
import { useOnline } from './lib/useOnline'

export default function App() {
  // undefined = 아직 로그인 상태 확인 중
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => onAuthStateChanged(auth, setUser), [])

  if (user === undefined) return <div className="app"><TitleBar /></div>
  if (!user) return <Login />
  return <Notes key={user.uid} user={user} />
}

function Notes({ user }: { user: User }) {
  const { notes, loaded, pending } = useNotes(user.uid)
  const online = useOnline()
  const [openId, setOpenId] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [searching, setSearching] = useState(false)

  const current = notes.find((n) => n.id === openId)
  const status: SyncStatus = !online ? 'offline' : typing ? 'typing' : pending ? 'syncing' : 'synced'
  const newNote = useCallback(() => setOpenId(createNote(user.uid)), [user.uid])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'n') {
        e.preventDefault()
        newNote()
      } else if (key === 'f') {
        e.preventDefault()
        setOpenId(null)
        setSearching(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newNote])

  return (
    <div className="app">
      <TitleBar>
        <button className="icon-btn" onClick={newNote} title="새 메모 (Ctrl/⌘+N)">
          <Icon name="plus" />
        </button>
        {!current && (
          <button
            className={`icon-btn${searching ? ' active' : ''}`}
            onClick={() => setSearching(!searching)}
            title="검색 (Ctrl/⌘+F)"
          >
            <Icon name="search" />
          </button>
        )}
      </TitleBar>
      {current ? (
        <NoteEditor
          key={current.id}
          uid={user.uid}
          note={current}
          onBack={() => setOpenId(null)}
          onTyping={setTyping}
        />
      ) : (
        <NoteList
          notes={notes}
          loaded={loaded}
          onOpen={setOpenId}
          searching={searching}
          onSearchEnd={() => setSearching(false)}
        />
      )}
      <StatusBar status={status}>
        {current ? (
          <span>{formatDate(current.updatedAt)} 수정</span>
        ) : (
          <>
            <span className="email">{user.email}</span>
            <button onClick={signOut}>로그아웃</button>
          </>
        )}
      </StatusBar>
    </div>
  )
}
