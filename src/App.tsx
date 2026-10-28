import { onAuthStateChanged, type User } from 'firebase/auth'
import { useCallback, useEffect, useState } from 'react'
import { Icon } from './components/Icon'
import { Login } from './components/Login'
import { MoreMenu } from './components/MoreMenu'
import { NoteEditor } from './components/NoteEditor'
import { NoteList } from './components/NoteList'
import { SearchBox } from './components/SearchBox'
import { StatusBar, type SyncStatus } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import { isOwner, signOut } from './lib/auth'
import { auth } from './lib/firebase'
import { formatDate } from './lib/formatDate'
import { createNote, useNotes } from './lib/notes'
import { useOnline } from './lib/useOnline'
import { win } from './lib/widget'

// 휴대폰(PWA)은 아이폰 메모앱처럼 추가·검색을 엄지가 닿는 하단에 두고, 계정·상태는 제목 아래, 나머지는 … 메뉴에 숨긴다.
const pwa = !win

// 웹은 휴대폰·태블릿 전용이다. PC는 데스크톱 앱을 쓴다. (iPadOS Safari는 Mac으로 자신을 소개하므로 터치 지점 수로 구분)
const ua = navigator.userAgent
const mobile = /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
const pcBrowser = pwa && !mobile && !import.meta.env.DEV
const DESKTOP_DOWNLOAD = 'https://github.com/jwpark1234/memoria/releases/latest'

export default function App() {
  // undefined = 아직 로그인 상태 확인 중
  const [user, setUser] = useState<User | null | undefined>(undefined)
  // 다른 계정은 로그인 직후 auth.ts가 내보낸다. 그 사이에 메모 화면이 뜨지 않게 로그아웃 상태로 본다.
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u && isOwner(u) ? u : null)), [])

  if (pcBrowser) return <PcBlocked />
  if (user === undefined) return <div className="app"><TitleBar /></div>
  if (!user) return <Login />
  return <Notes key={user.uid} user={user} />
}

function PcBlocked() {
  return (
    <div className="app">
      <div className="login">
        <p>웹 버전은 휴대폰에서만 쓸 수 있습니다.</p>
        <p>PC에서는 데스크톱 앱을 설치하세요.</p>
        <a className="primary" href={DESKTOP_DOWNLOAD}>
          데스크톱 앱 받기
        </a>
      </div>
    </div>
  )
}

function Notes({ user }: { user: User }) {
  const { notes, loaded, pending } = useNotes(user.uid)
  const online = useOnline()
  const [openId, setOpenId] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')

  const current = notes.find((n) => n.id === openId)
  const status: SyncStatus = !online ? 'offline' : typing ? 'typing' : pending ? 'syncing' : 'synced'
  const newNote = useCallback(() => setOpenId(createNote(user.uid)), [user.uid])
  const closeSearch = () => {
    setSearching(false)
    setQuery('')
  }

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

  const statusBar = (
    <StatusBar status={status}>
      {current ? (
        <span>{formatDate(current.updatedAt)} 수정</span>
      ) : (
        <>
          <span className="email">{user.email}</span>
          {!pwa && <button onClick={signOut}>로그아웃</button>}
        </>
      )}
    </StatusBar>
  )
  const searchBox = (
    <SearchBox value={query} onChange={setQuery} onClose={closeSearch} placeholder={pwa ? '검색' : undefined} />
  )
  const body = current ? (
    <NoteEditor key={current.id} uid={user.uid} note={current} onBack={() => setOpenId(null)} onTyping={setTyping} />
  ) : (
    <NoteList notes={notes} loaded={loaded} query={query} onOpen={setOpenId} />
  )

  if (pwa) {
    return (
      <div className="app pwa">
        <TitleBar>
          <MoreMenu />
        </TitleBar>
        {statusBar}
        {body}
        <nav className="bottombar">
          {searching && !current ? (
            <>
              {searchBox}
              <button className="text-btn" onClick={closeSearch}>
                취소
              </button>
            </>
          ) : (
            <>
              {!current && (
                <>
                  <button className="icon-btn" onClick={() => setSearching(true)} title="검색">
                    <Icon name="search" />
                  </button>
                  <span className="count">메모 {notes.length}개</span>
                </>
              )}
              <button className="icon-btn push" onClick={newNote} title="새 메모">
                <Icon name="plus" />
              </button>
            </>
          )}
        </nav>
      </div>
    )
  }

  return (
    <div className="app">
      <TitleBar>
        <button className="icon-btn" onClick={newNote} title="새 메모 (Ctrl/⌘+N)">
          <Icon name="plus" />
        </button>
        {!current && (
          <button
            className={`icon-btn${searching ? ' active' : ''}`}
            onClick={() => (searching ? closeSearch() : setSearching(true))}
            title="검색 (Ctrl/⌘+F)"
          >
            <Icon name="search" />
          </button>
        )}
      </TitleBar>
      {!current && searching && searchBox}
      {body}
      {statusBar}
    </div>
  )
}
