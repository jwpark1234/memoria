import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Note } from '../lib/notes'
import { useOverlayClose } from '../lib/overlay'
import {
  checklistCount,
  createTodo,
  deleteTodo,
  moveChecklists,
  setTodoDone,
  splitLegacyGroup,
  splitTodos,
  todoGroups,
  updateTodo,
  type Todo,
} from '../lib/todos'
import { ConfirmDialog } from './ConfirmDialog'
import { shortcutLabel, TODO_INPUT_ID } from '../lib/shortcuts'
import { Icon } from './Icon'

// 할일 = 작업 대장. 받은 일을 등록하고(받은 날), 끝내면 체크해서(완료한 날) 나중에 "무슨 일을 언제 받아 언제 끝냈는지" 본다.
// 메인 화면은 요약(TodoSummary): 오래된 진행 중 일 몇 개와 더보기. 전용 페이지(TodoPage)는 [진행 중 | 완료] 탭, 둘 다 그룹별로.


/** 2026/11/19 */
function fullDate(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}



/** <input type="date">의 값 (현지 날짜) */
function toDateInput(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 날짜만 바꾸고 시각은 그대로 둔다 (같은 날 안의 순서가 바뀌지 않게) */
function withDate(ms: number, value: string) {
  const [y, m, d] = value.split('-').map(Number)
  const t = new Date(ms)
  t.setFullYear(y, m - 1, d)
  return t.getTime()
}

function load(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 이번 실행 동안만 기억한다
  }
}

// 예전 할일("그룹 · 내용")은 보이는 대로 한 번 나눠 저장한다 (lib/todos.ts의 splitLegacyGroup)
function useSplitLegacy(uid: string, todos: Todo[]) {
  const sent = useRef(new Set<string>())
  useEffect(() => {
    for (const t of todos) {
      if (!t.legacy || sent.current.has(t.id)) continue
      sent.current.add(t.id)
      splitLegacyGroup(uid, t)
    }
  }, [uid, todos])
}

function Check({ uid, t }: { uid: string; t: Todo }) {
  const done = t.doneAt !== null
  return (
    <button
      className={`check${done ? ' on' : ''}`}
      onClick={(e) => {
        e.stopPropagation() // 줄을 누르면 고치기 창이 열린다. 체크만 바꾼다
        setTodoDone(uid, t.id, !done)
      }}
      title={done ? '다시 진행 중으로' : '완료 (오늘 날짜로 기록)'}
    />
  )
}

/** 줄 전체를 누르면(또는 Enter) 고치기 창을 연다 */
export const rowClick = (onEdit: () => void) => ({
  role: 'button',
  tabIndex: 0,
  title: '고치기',
  onClick: onEdit,
  onKeyDown: (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) onEdit()
  },
})

const GroupChip = ({ group }: { group: string }) => (group ? <span className="todo-chip">{group}</span> : null)

/** 진행 중인 일 한 줄: 체크 · (그룹) 내용 · 받은 날 */
function OpenRow({ uid, t, chip, onEdit }: { uid: string; t: Todo; chip: boolean; onEdit: () => void }) {
  return (
    <div className="todo" {...rowClick(onEdit)}>
      <Check uid={uid} t={t} />
      <span className="todo-text">
        {chip && <GroupChip group={t.group} />}
        {t.text}
      </span>
      <span className="todo-when" title="받은 날">
        {fullDate(t.createdAt)}
      </span>
    </div>
  )
}

/** 받은 일 등록 칸. group을 주면 그 그룹으로 넣는다 */
interface AddProps {
  uid: string
  group?: string
  placeholder?: string
  id?: string // 메인 화면 칸: 단축키(Ctrl+T)가 이 칸에 포커스를 준다
  hint?: string // 오른쪽에 보일 단축키 안내
}

function AddForm({ uid, group = '', placeholder, id, hint }: AddProps) {
  const [draft, setDraft] = useState('')
  return (
    <form
      className="todo-add"
      onSubmit={(e) => {
        e.preventDefault()
        const text = draft.trim()
        if (!text) return
        createTodo(uid, text, group)
        setDraft('')
      }}
    >
      <Icon name="plus" size={13} />
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder ?? '받은 일 등록 (오늘 받음)'}
        enterKeyHint="done"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft('')
            e.currentTarget.blur()
          }
        }}
      />
      {hint && <kbd className="kbd">{hint}</kbd>}
    </form>
  )
}

// 메인 화면 요약에 보일 진행 중 일 수
const SUMMARY = 5

/** 메인 화면의 할일 칸: + 할일 등록, 오래된 진행 중 일 SUMMARY개. 머리줄의 더보기는 부르는 쪽(HomeCard)이 단다 */
interface SummaryProps {
  uid: string
  todos: Todo[]
  notes: Note[]
  limit?: number
  noAdd?: boolean // 등록 칸을 숨긴다 (휴대폰 홈은 + 버튼으로)
}

export function TodoSummary({ uid, todos, notes, limit = SUMMARY, noAdd = false }: SummaryProps) {
  useSplitLegacy(uid, todos)
  const { open } = splitTodos(todos)
  const [editing, setEditing] = useState<string | null>(null)
  const current = todos.find((t) => t.id === editing)
  return (
    <>
      {!noAdd && <AddForm uid={uid} placeholder="할일 등록 (오늘 받음)" id={TODO_INPUT_ID} hint={shortcutLabel('todo')} />}
      <ChecklistMove uid={uid} notes={notes} />
      {open.slice(0, limit).map((t) => (
        <OpenRow key={t.id} uid={uid} t={t} chip onEdit={() => setEditing(t.id)} />
      ))}
      {open.length === 0 && <p className="cal-empty">진행 중인 일 없음</p>}
      {current && <TodoDialog uid={uid} todo={current} groups={todoGroups(todos)} onClose={() => setEditing(null)} />}
    </>
  )
}

const TAB_KEY = 'memoria.todoTab'
const FOLDED_KEY = 'memoria.todoFolded' // 접은 그룹 (탭마다: "open:와플", "done:와플")

/** 끝낸 일 한 줄: 체크 · 내용 · (오른쪽) 등록일자 ~ 완료일자 */
function DoneRow({ uid, t, onEdit }: { uid: string; t: Todo; onEdit: () => void }) {
  return (
    <div className="todo done" {...rowClick(onEdit)}>
      <Check uid={uid} t={t} />
      <span className="todo-text">{t.text}</span>
      <span className="todo-when" title={`등록 ${fullDate(t.createdAt)} ~ 완료 ${fullDate(t.doneAt!)}`}>
        {fullDate(t.createdAt)} ~ {fullDate(t.doneAt!)}
      </span>
    </div>
  )
}

/**
 * 할일 전용 페이지: [진행 중 | 완료] 탭. 두 탭 모두 그룹별로 묶어 접고 편다 (그룹 없는 일은 맨 아래).
 * 진행 중은 오래 받은 일부터, 그룹마다 바로 등록할 수 있다. 완료는 최근에 끝낸 일부터, 줄마다 등록일자 · 완료일자.
 */
export function TodoPage({ uid, todos, notes }: { uid: string; todos: Todo[]; notes: Note[] }) {
  useSplitLegacy(uid, todos)
  const { open, done } = splitTodos(todos)
  const groups = todoGroups(todos)
  const [tab, setTab] = useState<'open' | 'done'>(() => (load(TAB_KEY) === 'done' ? 'done' : 'open'))
  const [folded, setFolded] = useState<string[]>(() => {
    try {
      return JSON.parse(load(FOLDED_KEY) ?? '[]')
    } catch {
      return []
    }
  })
  const [adding, setAdding] = useState<string | null>(null) // 이 그룹에 등록 칸을 연다 (진행 중 탭)
  const [newGroup, setNewGroup] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const pick = (t: 'open' | 'done') => {
    setTab(t)
    store(TAB_KEY, t)
  }
  const foldKey = (g: string) => `${tab}:${g}`
  const fold = (g: string) => {
    const k = foldKey(g)
    const next = folded.includes(k) ? folded.filter((x) => x !== k) : [...folded, k]
    setFolded(next)
    store(FOLDED_KEY, JSON.stringify(next))
  }

  // 지금 탭의 그룹 묶음 (새로 만든 그룹은 첫 할일을 넣기 전까지 등록 칸만 보인다)
  const list = tab === 'open' ? open : done
  const names = groups.filter((g) => list.some((t) => t.group === g))
  if (tab === 'open' && adding && !names.includes(adding)) names.push(adding)
  const sections = [...names, '']
    .map((g) => ({ group: g, items: list.filter((t) => t.group === g) }))
    .filter((s) => s.items.length || (tab === 'open' && s.group === adding))

  const current = todos.find((t) => t.id === editing)

  return (
    <>
      <div className="todo-head">
        <div className="segment todo-tabs">
          <button className={tab === 'open' ? 'on' : ''} onClick={() => pick('open')}>
            진행 중 {open.length}
          </button>
          <button className={tab === 'done' ? 'on' : ''} onClick={() => pick('done')}>
            완료 {done.length}
          </button>
        </div>
        {tab === 'open' && (
          <button className="text-btn" onClick={() => setNewGroup(true)} title="새 그룹을 만들어 등록">
            <Icon name="plus" size={13} />
            그룹
          </button>
        )}
      </div>
      {tab === 'open' && <ChecklistMove uid={uid} notes={notes} />}
      {sections.map(({ group, items }) => {
        const isFolded = folded.includes(foldKey(group))
        return (
          <section key={group || '-'} className="todo-section-group">
            <div className="todo-group-head">
              <button className="todo-group-name" onClick={() => fold(group)} aria-expanded={!isFolded}>
                <span className={`cal-caret${isFolded ? '' : ' up'}`}>
                  <Icon name="forward" size={10} />
                </span>
                {group || '그룹 없음'}
                <span className="todo-count">{items.length}</span>
              </button>
              {tab === 'open' && (
                <button
                  className="icon-btn"
                  onClick={() => setAdding(adding === group ? null : group)}
                  title={`${group || '그룹 없음'}에 등록`}
                >
                  <Icon name="plus" size={14} />
                </button>
              )}
            </div>
            {!isFolded && (
              <>
                {tab === 'open' && adding === group && (
                  <AddForm uid={uid} group={group} placeholder={`${group || '그룹 없음'}에 받은 일 등록`} />
                )}
                {items.map((t) =>
                  tab === 'open' ? (
                    <OpenRow key={t.id} uid={uid} t={t} chip={false} onEdit={() => setEditing(t.id)} />
                  ) : (
                    <DoneRow key={t.id} uid={uid} t={t} onEdit={() => setEditing(t.id)} />
                  ),
                )}
              </>
            )}
          </section>
        )
      })}
      {tab === 'open' && open.length === 0 && adding === null && <AddForm uid={uid} />}
      {tab === 'done' && done.length === 0 && <p className="cal-empty">완료한 일 없음</p>}
      {current && <TodoDialog uid={uid} todo={current} groups={groups} onClose={() => setEditing(null)} />}
      {newGroup && (
        <NewGroupDialog
          groups={groups}
          onDone={(g) => {
            setNewGroup(false)
            if (g === null) return
            setAdding(g)
            if (folded.includes(`open:${g}`)) fold(g)
          }}
        />
      )}
    </>
  )
}

/** 새 그룹 이름을 받는다. 그 그룹에 등록 칸이 열리고, 첫 할일을 넣으면 그룹이 생긴다. */
function NewGroupDialog({ groups, onDone }: { groups: string[]; onDone: (group: string | null) => void }) {
  const overlay = useOverlayClose(() => onDone(null))
  const [name, setName] = useState('')
  return (
    <div className="overlay" {...overlay}>
      <form
        className="dialog form"
        role="dialog"
        aria-modal
        aria-label="새 그룹"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onDone(name.trim())
        }}
      >
        <p>새 그룹</p>
        <label className="field">
          <span>이름</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 와플, 집 일" />
        </label>
        {groups.includes(name.trim()) && <p className="detail">이미 있는 그룹입니다. 그 그룹에 등록합니다.</p>}
        <div className="dialog-actions">
          <button type="button" onClick={() => onDone(null)}>
            취소
          </button>
          <button type="submit" className="ok" disabled={!name.trim()}>
            만들기
          </button>
        </div>
      </form>
    </div>
  )
}

/** 할일 고치기: 내용 · 그룹 · 받은 날 · 완료한 날(끝낸 일만) · 삭제 */
function TodoDialog({ uid, todo, groups, onClose }: { uid: string; todo: Todo; groups: string[]; onClose: () => void }) {
  const overlay = useOverlayClose(onClose)
  const [text, setText] = useState(todo.text)
  const [group, setGroup] = useState(todo.group)
  const [received, setReceived] = useState(toDateInput(todo.createdAt))
  const [finished, setFinished] = useState(todo.doneAt !== null ? toDateInput(todo.doneAt) : '')
  const [confirming, setConfirming] = useState(false)
  const isDone = todo.doneAt !== null
  // 완료한 날이 받은 날보다 앞설 수 없다 (YYYY-MM-DD는 글자 비교로 순서가 맞다)
  const invalid = !text.trim() || !received || (isDone && (!finished || finished < received))

  const save = () => {
    if (invalid) return
    updateTodo(uid, todo.id, {
      text: text.trim(),
      group: group.trim(),
      createdAt: withDate(todo.createdAt, received),
      ...(isDone && { doneAt: withDate(todo.doneAt!, finished) }),
    })
    onClose()
  }

  if (confirming) {
    return (
      <ConfirmDialog
        message="이 할일을 삭제할까요?"
        detail="기록에서도 사라집니다."
        confirmLabel="삭제"
        onConfirm={() => {
          deleteTodo(uid, todo.id)
          onClose()
        }}
        onCancel={() => setConfirming(false)}
      />
    )
  }

  return (
    <div className="overlay" {...overlay}>
      <form
        className="dialog form"
        role="dialog"
        aria-modal
        aria-label="할일 고치기"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <p>할일</p>
        <label className="field">
          <span>내용</span>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="할일" />
        </label>
        <label className="field">
          <span>그룹</span>
          <input list="todo-groups" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="그룹 없음" />
          <datalist id="todo-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>등록일자</span>
          <input type="date" required value={received} onChange={(e) => setReceived(e.target.value)} />
        </label>
        {isDone && (
          <label className="field">
            <span>완료일자</span>
            <input type="date" required min={received} value={finished} onChange={(e) => setFinished(e.target.value)} />
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" className="danger-text" onClick={() => setConfirming(true)}>
            삭제
          </button>
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="ok" disabled={invalid}>
            저장
          </button>
        </div>
      </form>
    </div>
  )
}

/** 메모 속에 체크리스트("- [ ] 항목")가 남아 있으면 할일로 옮기는 버튼 (lib/todos.ts의 moveChecklists) */
function ChecklistMove({ uid, notes }: { uid: string; notes: Note[] }) {
  const count = checklistCount(notes)
  const [asking, setAsking] = useState(false)
  const [state, setState] = useState<'idle' | 'busy' | string>('idle')
  if (!count && state === 'idle') return null

  const run = async () => {
    setAsking(false)
    setState('busy')
    try {
      const moved = await moveChecklists(uid, notes)
      setState(`${moved}개를 할일로 옮겼습니다`)
    } catch (e) {
      console.error('[todos]', e)
      const denied = (e as { code?: string }).code === 'permission-denied'
      setState(denied ? '옮기지 못함: 할일 저장 권한(Firestore 규칙 배포)이 필요합니다' : '옮기지 못함: 다시 시도하세요')
    }
  }

  return (
    <div className="todo-move">
      {state === 'idle' ? (
        <button className="text-btn" onClick={() => setAsking(true)}>
          메모 속 체크리스트 {count}개를 할일로 옮기기
        </button>
      ) : (
        <span onClick={() => state !== 'busy' && setState('idle')}>{state === 'busy' ? '옮기는 중…' : state}</span>
      )}
      {asking && (
        <ConfirmDialog
          message={`체크리스트 ${count}개를 할일로 옮길까요?`}
          detail="메모에서는 그 줄을 지웁니다. 체크한 항목은 완료한 할일이 됩니다. 잠금 메모는 건너뜁니다."
          confirmLabel="옮기기"
          onConfirm={run}
          onCancel={() => setAsking(false)}
        />
      )}
    </div>
  )
}

/** 할일 등록 창 (휴대폰 할일 탭의 + 버튼): 내용 · 그룹. 등록일자는 오늘 */
export function TodoAddDialog({ uid, groups, onClose }: { uid: string; groups: string[]; onClose: () => void }) {
  const overlay = useOverlayClose(onClose)
  const [text, setText] = useState('')
  const [group, setGroup] = useState('')
  return (
    <div className="overlay" {...overlay}>
      <form
        className="dialog form"
        role="dialog"
        aria-modal
        aria-label="할일 등록"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          createTodo(uid, text.trim(), group.trim())
          onClose()
        }}
      >
        <p>할일 등록</p>
        <label className="field">
          <span>내용</span>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="받은 일" enterKeyHint="next" />
        </label>
        <label className="field">
          <span>그룹</span>
          <input list="todo-add-groups" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="그룹 없음" />
          <datalist id="todo-add-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="ok" disabled={!text.trim()}>
            등록
          </button>
        </div>
      </form>
    </div>
  )
}
