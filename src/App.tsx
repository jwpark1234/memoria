import { onAuthStateChanged, type User } from 'firebase/auth'
import { useCallback, useEffect, useState } from 'react'
import { Icon } from './components/Icon'
import { LockedNote } from './components/LockForm'
import { Login } from './components/Login'
import { MoreMenu } from './components/MoreMenu'
import { NoteEditor } from './components/NoteEditor'
import { NoteList } from './components/NoteList'
import { NoteWindow } from './components/NoteWindow'
import { ScheduleDialog } from './components/ScheduleDialog'
import { ScheduleList } from './components/ScheduleList'
import { SearchBox } from './components/SearchBox'
import { StatusBar, type SyncStatus } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import { askNotifyPermission, useAlarms } from './lib/alarms'
import { isOwner } from './lib/auth'
import { auth } from './lib/firebase'
import { formatDate } from './lib/formatDate'
import { noteWindowId, openNoteWindow } from './lib/noteWindows'
import { lockNow, useDecrypted } from './lib/lock'
import { createNote, useNotes } from './lib/notes'
import { registerPush } from './lib/push'
import { nextHour, startOfDay, useSchedules } from './lib/schedules'
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
  if (noteWindowId) return <NoteWindow />
  return <Main />
}

function Main() {
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
  const { notes: stored, loaded, pending } = useNotes(user.uid)
  // 잠금 메모는 연 동안만 본문이 보인다 (lib/lock.ts)
  const notes = useDecrypted(stored)
  const schedules = useSchedules(user.uid)
  useAlarms(user.uid, schedules, notes)
  // 휴대폰: 알림을 허용해 두었으면 열 때마다 푸시 토큰을 새로 올린다 (토큰은 바뀔 수 있다)
  useEffect(() => {
    if (pwa) registerPush(user.uid).catch((e) => console.error('[push]', e))
  }, [user.uid])
  // 일정 알림은 기본으로 켠다. 휴대폰 브라우저는 화면을 누를 때만 권한을 물을 수 있어서 첫 번째 누름에 묻는다.
  useEffect(() => {
    if (!pwa || typeof Notification === 'undefined' || Notification.permission !== 'default') return
    const ask = () => {
      askNotifyPermission()
        .then(() => registerPush(user.uid))
        .catch((e) => console.error('[push]', e))
    }
    document.addEventListener('click', ask, { once: true, capture: true })
    return () => document.removeEventListener('click', ask, { capture: true })
  }, [user.uid])
  const online = useOnline()
  const [openId, setOpenId] = useState<string | null>(null)
  // 목록 화면: 메모 또는 일정. 일정에서 연 메모를 닫으면 일정으로 돌아온다.
  const [view, setView] = useState<'notes' | 'schedules'>('notes')
  const [addingSchedule, setAddingSchedule] = useState(false)
  // 일정 달력에서 고른 날. 새 일정은 이 날로 잡고, 만들면 그 일정의 날을 보여준다.
  const [calendarDay, setCalendarDay] = useState(() => startOfDay())
  const [typing, setTyping] = useState(false)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')

  const current = notes.find((n) => n.id === openId)
  // 잠금 메모는 열 때마다 암호를 묻는다: 메모를 닫거나 다른 메모로 넘어가면 다시 잠근다.
  // (닫히는 편집기가 마지막 저장을 먼저 한다. 저장은 부른 순간에 키를 잡는다)
  useEffect(() => () => lockNow(), [openId])
  const scheduleView = view === 'schedules' && !current
  const status: SyncStatus = !online ? 'offline' : typing ? 'typing' : pending ? 'syncing' : 'synced'
  const newNote = useCallback(() => setOpenId(createNote(user.uid)), [user.uid])
  const add = () => (scheduleView ? setAddingSchedule(true) : newNote())
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
        setView('notes')
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
        <span className="email">{user.email}</span>
      )}
    </StatusBar>
  )
  const viewButton = !current && (
    <button
      className={`icon-btn${scheduleView ? ' active' : ''}`}
      onClick={() => setView(scheduleView ? 'notes' : 'schedules')}
      title={scheduleView ? '메모 목록' : '일정'}
    >
      <Icon name="calendar" />
    </button>
  )
  const body = current?.sealed ? (
    <LockedNote uid={user.uid} title={current.title} onBack={() => setOpenId(null)} />
  ) : current ? (
    <NoteEditor
      key={current.id}
      uid={user.uid}
      note={current}
      schedules={schedules.filter((s) => s.noteId === current.id)}
      onBack={() => setOpenId(null)}
      onSchedules={() => setView('schedules')}
      onTyping={setTyping}
      onPopOut={
        pwa
          ? undefined
          : () => {
              openNoteWindow(current.id)
              setOpenId(null)
            }
      }
    />
  ) : scheduleView ? (
    <ScheduleList
      uid={user.uid}
      schedules={schedules}
      notes={notes}
      onOpenNote={setOpenId}
      day={calendarDay}
      onDay={setCalendarDay}
    />
  ) : (
    <NoteList notes={notes} schedules={schedules} loaded={loaded} query={query} onOpen={setOpenId} />
  )
  const scheduleDialog = addingSchedule && (
    <ScheduleDialog
      uid={user.uid}
      init={{ title: '', noteId: null, item: null, at: nextHour(calendarDay) }}
      onCreated={(_, at) => setCalendarDay(startOfDay(at))}
      onClose={() => setAddingSchedule(false)}
    />
  )

  if (pwa) {
    const cancelSearch = () => {
      setQuery('')
      ;(document.activeElement as HTMLElement | null)?.blur()
    }
    return (
      <div className="app pwa">
        <TitleBar>
          {viewButton}
          <MoreMenu />
        </TitleBar>
        {body}
        {/* 하단 도구줄은 목록에서만: 아이폰 메모앱처럼 검색칸은 늘 열려 있고, 오른쪽에 추가 버튼. 맨 아래는 상태·계정 줄 */}
        {!current && (
          <nav className="bottombar">
            {scheduleView ? (
              <span className="count">일정 {schedules.filter((s) => !s.done).length}개</span>
            ) : (
              <>
                <SearchBox
                  value={query}
                  onChange={setQuery}
                  onClose={cancelSearch}
                  placeholder={`메모 ${notes.length}개 검색`}
                  autoFocus={false}
                />
                {query && (
                  <button className="text-btn" onClick={cancelSearch}>
                    취소
                  </button>
                )}
              </>
            )}
            <button className="icon-btn" onClick={add} title={scheduleView ? '새 일정' : '새 메모'}>
              <Icon name="plus" />
            </button>
          </nav>
        )}
        {statusBar}
        {scheduleDialog}
      </div>
    )
  }

  return (
    <div className="app">
      <TitleBar>
        <button className="icon-btn" onClick={add} title={scheduleView ? '새 일정' : '새 메모 (Ctrl/⌘+N)'}>
          <Icon name="plus" />
        </button>
        {!current && !scheduleView && (
          <button
            className={`icon-btn${searching ? ' active' : ''}`}
            onClick={() => (searching ? closeSearch() : setSearching(true))}
            title="검색 (Ctrl/⌘+F)"
          >
            <Icon name="search" />
          </button>
        )}
        {viewButton}
      </TitleBar>
      {!current && !scheduleView && searching && <SearchBox value={query} onChange={setQuery} onClose={closeSearch} />}
      {body}
      {statusBar}
      {scheduleDialog}
    </div>
  )
}
