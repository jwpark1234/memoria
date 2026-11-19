import { onAuthStateChanged, type User } from 'firebase/auth'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { BusBanner } from './components/Bus'
import { Icon } from './components/Icon'
import { LockedNote } from './components/LockForm'
import { Login } from './components/Login'
import { MiniWidget } from './components/MiniWidget'
import { MoreMenu } from './components/MoreMenu'
import { NoteEditor } from './components/NoteEditor'
import { NoteList } from './components/NoteList'
import { NoteWindow } from './components/NoteWindow'
import { ScheduleDialog } from './components/ScheduleDialog'
import { ScheduleList, ScheduleSummary } from './components/ScheduleList'
import { SearchBox } from './components/SearchBox'
import { StatusBar, type SyncStatus } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import { TodoAddDialog, TodoPage, TodoSummary } from './components/TodoList'
import { askNotifyPermission, useAlarms } from './lib/alarms'
import { isOwner } from './lib/auth'
import { auth } from './lib/firebase'
import { formatDate } from './lib/formatDate'
import { noteWindowId, openNoteWindow } from './lib/noteWindows'
import { lockNow, useDecrypted } from './lib/lock'
import { busEnabled, useBusFavorites } from './lib/bus'
import { createNote, useNotes } from './lib/notes'
import { registerPush } from './lib/push'
import { nextHour, startOfDay, useSchedules } from './lib/schedules'
import { shortcutLabel, shortcutOf, TODO_INPUT_ID } from './lib/shortcuts'
import { todoGroups, useTodos } from './lib/todos'
import { useOnline } from './lib/useOnline'
import { mainWindow, setWidget, win } from './lib/widget'

// 휴대폰(PWA)은 아이폰 메모앱처럼 추가·검색을 엄지가 닿는 하단에 두고, 계정·상태는 제목 아래, 나머지는 … 메뉴에 숨긴다.
const pwa = !win

// 웹은 휴대폰·태블릿 전용이다. PC는 데스크톱 앱을 쓴다. (iPadOS Safari는 Mac으로 자신을 소개하므로 터치 지점 수로 구분)
const ua = navigator.userAgent
const mobile = /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
const pcBrowser = pwa && !mobile && !import.meta.env.DEV
const DESKTOP_DOWNLOAD = 'https://github.com/jwpark1234/memoria/releases/latest'

type View = 'home' | 'schedules' | 'todos' | 'notes'
const VIEW_TITLE: Record<Exclude<View, 'home'>, string> = {
  schedules: '일정',
  todos: '할일',
  notes: '메모',
}
// 휴대폰 아래 탭: 홈(요약) · 일정 · 할일 · 메모
type Tab = View
const TABS: Tab[] = ['home', 'schedules', 'todos', 'notes']
const TAB_ICON = { home: 'home', schedules: 'calendar', todos: 'check', notes: 'pencil' } as const
const TAB_TITLE: Record<Tab, string> = { home: '홈', schedules: '일정', todos: '할일', notes: '메모' }
// 휴대폰 홈에 보일 칸마다의 항목 수
const PWA_HOME_ITEMS = 3
const TAB_KEY = 'memoria.mobileTab'
function loadTab(): Tab {
  try {
    const t = localStorage.getItem(TAB_KEY)
    return TABS.includes(t as Tab) ? (t as Tab) : 'home'
  } catch {
    return 'home'
  }
}
// 메인 화면에 보일 메모 수 (일정·할일도 5개)
const HOME_NOTES = 5

/** 메인 화면의 한 칸: 세 칸 모두 같은 틀이다. 제목 · 더보기 › / + 등록 / 항목 5개 */
function HomeCard({
  title,
  onMore,
  className = '',
  children,
}: {
  title: string
  onMore: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`widget home-card ${className}`}>
      <div className="home-card-head">
        <h3 className="list-head">{title}</h3>
        <button className="text-btn home-more" onClick={onMore}>
          더보기
          <Icon name="forward" size={12} />
        </button>
      </div>
      {children}
    </section>
  )
}

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
  const todos = useTodos(user.uid)
  useAlarms(user.uid, schedules)
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
  const [addingSchedule, setAddingSchedule] = useState(false)
  // 일정 달력에서 고른 날. 새 일정은 이 날로 잡고, 만들면 그 일정의 날을 보여준다.
  const [calendarDay, setCalendarDay] = useState(() => startOfDay())
  const [typing, setTyping] = useState(false)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const busFavorites = useBusFavorites(user.uid)
  // PC 메인 화면(home)은 일정·할일·메모 요약, 더보기를 누르면 그 전용 페이지
  const [view, setView] = useState<View>('home')
  // 휴대폰은 아래 탭으로 [일정 | 할일 | 메모] 중 하나를 화면 가득. 기기마다 기억한다
  const [tab, setTab] = useState<Tab>(loadTab)
  const pickTab = (t: Tab) => {
    setTab(t)
    try {
      localStorage.setItem(TAB_KEY, t)
    } catch {
      // 이번 실행 동안만 기억한다
    }
  }
  const [addingTodo, setAddingTodo] = useState(false)
  // 휴대폰 홈의 + 버튼: 일정 · 할일 · 메모 중 고르는 작은 메뉴
  const [fabMenu, setFabMenu] = useState(false)

  const current = notes.find((n) => n.id === openId)
  // 잠금 메모는 열 때마다 암호를 묻는다: 메모를 닫거나 다른 메모로 넘어가면 다시 잠근다.
  // (닫히는 편집기가 마지막 저장을 먼저 한다. 저장은 부른 순간에 키를 잡는다)
  useEffect(() => () => lockNow(), [openId])
  const status: SyncStatus = !online ? 'offline' : typing ? 'typing' : pending ? 'syncing' : 'synced'
  const newNote = useCallback(() => setOpenId(createNote(user.uid)), [user.uid])
  const closeSearch = () => {
    setSearching(false)
    setQuery('')
  }
  // 검색 중에는 메모 페이지처럼 메모만 보인다 (휴대폰은 하단 검색칸에 글자가 있을 때)
  const filtering = pwa ? query.trim() !== '' : searching
  const page: View = filtering ? 'notes' : view

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc: PC는 미니모드로 (휴대폰은 메인 화면으로). 입력 중이거나 창·시트가 열려 있으면 그쪽이 먼저 받는다.
      if (e.key === 'Escape') {
        const typing = (e.target as Element).closest?.('input, textarea, [contenteditable]')
        if (e.defaultPrevented || typing || document.querySelector('.overlay, .menu')) return
        if (mainWindow) setWidget({ mini: true })
        else setView('home')
        return
      }
      // 단축키 (lib/shortcuts.ts): 일정 Ctrl+Q · 할일 Ctrl+W · 메모 Ctrl+E · 검색 Ctrl+F
      const target = shortcutOf(e)
      if (!target) return
      e.preventDefault()
      if (target === 'note') return newNote()
      setOpenId(null) // 편집 중인 메모는 닫으며 저장된다
      if (target === 'schedule') setAddingSchedule(true)
      else if (target === 'search') {
        if (pwa) {
          pickTab('notes')
          return requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.pwa-search input')?.focus())
        }
        setSearching(true)
      } else {
        // 메인 화면의 할일 등록 칸으로
        closeSearch()
        setView('home')
        requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(TODO_INPUT_ID)?.focus()))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newNote])

  const statusBar = (
    <StatusBar status={status}>
      {current && <span>{formatDate(current.updatedAt)} 수정</span>}
      {/* 우하단: 로그인한 구글 계정 */}
      {user.email && (
        <span className="email" title={`${user.email}로 로그인됨`}>
          {user.email}
        </span>
      )}
    </StatusBar>
  )
  // 메인 화면: 일정(한 달 달력 + 고른 날부터 다가오는 5개) · 할일(진행 중 5개) · 메모(최근 5개)를 한 화면에, 칸마다 + 등록과 더보기 → 전용 페이지.
  // PC는 위젯 창이라 칸마다 카드로 쌓는다. 버스 즐겨찾기 편집은 설정에 있다.
  const card = (v: Exclude<View, 'home'>, children: ReactNode, extra?: string) => (
    <HomeCard title={VIEW_TITLE[v]} onMore={() => (pwa ? pickTab(v) : setView(v))} className={extra}>
      {children}
    </HomeCard>
  )
  const body = current?.sealed ? (
    <LockedNote uid={user.uid} title={current.title} onBack={() => setOpenId(null)} />
  ) : current ? (
    <NoteEditor
      key={current.id}
      uid={user.uid}
      note={current}
      onBack={() => setOpenId(null)}
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
  ) : pwa ? (
    // 휴대폰: 고른 탭을 화면 가득, 오른쪽 아래 + 버튼으로 그 탭에 등록
    <div className="pwa-main">
      <div className={`list ${tab === 'home' ? 'home' : 'page'}`}>
        {tab === 'home' && (
          <>
            {card(
              'schedules',
              <ScheduleSummary
                uid={user.uid}
                schedules={schedules}
                day={calendarDay}
                onDay={setCalendarDay}
                limit={PWA_HOME_ITEMS}
                week
              />,
              'cal-widget',
            )}
            {card('todos', <TodoSummary uid={user.uid} todos={todos} notes={notes} limit={PWA_HOME_ITEMS} noAdd />, 'todo-widget')}
            {card('notes', <NoteList notes={notes} loaded={loaded} query="" onOpen={setOpenId} limit={PWA_HOME_ITEMS} compact />)}
          </>
        )}
        {tab === 'notes' && (
          <div className="pwa-search">
            <SearchBox
              value={query}
              onChange={setQuery}
              onClose={() => setQuery('')}
              placeholder={`메모 ${notes.length}개 검색`}
              autoFocus={false}
            />
          </div>
        )}
        {tab === 'schedules' && (
          <ScheduleList
            uid={user.uid}
            schedules={schedules}
            day={calendarDay}
            onDay={setCalendarDay}
            onAdd={() => setAddingSchedule(true)}
            defaultExpanded
          />
        )}
        {tab === 'todos' && <TodoPage uid={user.uid} todos={todos} notes={notes} />}
        {tab === 'notes' && <NoteList notes={notes} loaded={loaded} query={query} onOpen={setOpenId} rows />}
      </div>
      {/* 홈의 + 는 [일정 · 할일 · 메모] 고르는 메뉴, 다른 탭의 + 는 그 탭에 바로 등록 */}
      {fabMenu && (
        <div className="fab-menu" onClick={() => setFabMenu(false)}>
          {(
            [
              ['schedules', () => setAddingSchedule(true)],
              ['todos', () => setAddingTodo(true)],
              ['notes', newNote],
            ] as const
          ).map(([v, add]) => (
            <button key={v} onClick={add}>
              <Icon name={TAB_ICON[v]} size={16} />
              {VIEW_TITLE[v]} 등록
            </button>
          ))}
        </div>
      )}
      <button
        className={`fab${fabMenu ? ' open' : ''}`}
        onClick={() =>
          tab === 'home'
            ? setFabMenu(!fabMenu)
            : tab === 'schedules'
              ? setAddingSchedule(true)
              : tab === 'todos'
                ? setAddingTodo(true)
                : newNote()
        }
        title={tab === 'home' ? '등록' : `${TAB_TITLE[tab]} 등록`}
        aria-label={tab === 'home' ? '등록' : `${TAB_TITLE[tab]} 등록`}
        aria-expanded={tab === 'home' ? fabMenu : undefined}
      >
        <Icon name="plus" size={24} />
      </button>
    </div>
  ) : page === 'home' ? (
    <div className="list home">
      {card(
        'schedules',
        <ScheduleSummary
          uid={user.uid}
          schedules={schedules}
          day={calendarDay}
          onDay={setCalendarDay}
          onAdd={() => setAddingSchedule(true)}
        />,
        'cal-widget',
      )}
      {card('todos', <TodoSummary uid={user.uid} todos={todos} notes={notes} />, 'todo-widget')}
      {card(
        'notes',
        <>
          <button
            className="home-add"
            onClick={newNote}
            title={shortcutLabel('note') ? `메모 등록 (${shortcutLabel('note')})` : undefined}
          >
            <Icon name="plus" size={13} />
            메모 등록
            {shortcutLabel('note') && <kbd className="kbd">{shortcutLabel('note')}</kbd>}
          </button>
          <NoteList notes={notes} loaded={loaded} query="" onOpen={setOpenId} limit={HOME_NOTES} compact />
        </>,
      )}
    </div>
  ) : (
    <div className="list page">
      {/* 검색 중에는 머리줄 없이 메모 결과만 */}
      {!filtering && (
        <div className="page-head">
          <button className="icon-btn" onClick={() => setView('home')} title="메인 화면으로 (Esc)">
            <Icon name="back" />
          </button>
          <h2>{VIEW_TITLE[page]}</h2>
          {page === 'notes' && <span className="page-count">{notes.length}개</span>}
        </div>
      )}
      {page === 'schedules' && (
        <section className="widget cal-widget">
          <ScheduleList
            uid={user.uid}
            schedules={schedules}
            day={calendarDay}
            onDay={setCalendarDay}
            onAdd={() => setAddingSchedule(true)}
            defaultExpanded
          />
        </section>
      )}
      {page === 'todos' && (
        <section className="widget todo-widget">
          <TodoPage uid={user.uid} todos={todos} notes={notes} />
        </section>
      )}
      {page === 'notes' && <NoteList notes={notes} loaded={loaded} query={query} onOpen={setOpenId} rows={pwa} />}
    </div>
  )
  // 버스는 부가 정보라 맨 아래 얇은 배너로 (즐겨찾기한 정류소마다 흐르는 한 줄)
  const busDock = busEnabled && !current && !(pwa ? tab === 'notes' && filtering : filtering) && busFavorites.length > 0 && (
    <BusBanner favorites={busFavorites} />
  )
  const dialogs = (
    <>
      {addingSchedule && (
        <ScheduleDialog
          uid={user.uid}
          init={{ title: '', at: nextHour(calendarDay) }}
          onCreated={(_, at) => setCalendarDay(startOfDay(at))}
          onClose={() => setAddingSchedule(false)}
        />
      )}
      {addingTodo && <TodoAddDialog uid={user.uid} groups={todoGroups(todos)} onClose={() => setAddingTodo(false)} />}
    </>
  )

  if (pwa) {
    return (
      <div className="app pwa">
        <TitleBar>
          <MoreMenu />
        </TitleBar>
        {body}
        {busDock}
        {/* 아래 탭: 일정 · 할일 · 메모 (메모를 고치는 동안은 숨긴다). 맨 아래는 상태·계정 줄 */}
        {!current && (
          <nav className="tabbar" role="tablist">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => {
                  pickTab(t)
                  setFabMenu(false)
                }}>
                <Icon name={TAB_ICON[t]} size={20} />
                <span>{TAB_TITLE[t]}</span>
              </button>
            ))}
          </nav>
        )}
        {statusBar}
        {dialogs}
      </div>
    )
  }

  return (
    <>
      <div className="app">
        <TitleBar>
          {/* 새 메모는 메모 칸의 + 메모 등록 (또는 Ctrl/⌘+N) */}
          {!current && (
            <button
              className={`icon-btn${searching ? ' active' : ''}`}
              onClick={() => (searching ? closeSearch() : setSearching(true))}
              title={`검색 (${shortcutLabel('search')})`}
            >
              <Icon name="search" />
            </button>
          )}
        </TitleBar>
        {!current && searching && <SearchBox value={query} onChange={setQuery} onClose={closeSearch} />}
        {body}
        {busDock}
        {statusBar}
        {dialogs}
      </div>
      {/* 미니모드에서는 .app을 가리고 이 위젯만 보인다 */}
      <MiniWidget
        schedules={schedules}
        todos={todos}
        favorites={busFavorites}
        onOpenTodos={() => {
          setOpenId(null)
          setView('todos')
        }}
      />
    </>
  )
}
