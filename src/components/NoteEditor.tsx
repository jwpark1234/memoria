import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type TouchEvent,
} from 'react'
import {
  checkPrefix,
  checklistItem,
  continueChecklist,
  copyText,
  deletePrefix,
  findItemLine,
  lineIndexAt,
  linkAt,
  locateItems,
  pasteText,
  plain,
  shiftItems,
  toggleChecklist,
  toggleDone,
  toggleLine,
  type Edit,
  type ItemLines,
} from '../lib/markup'
import { deleteNote, setNoteLocked, updateLockedNote, updateNote, type Note } from '../lib/notes'
import { openUrl } from '../lib/openUrl'
import { deleteSchedule, formatWhen, unlinkSchedule, updateSchedule, type Schedule } from '../lib/schedules'
import { ConfirmDialog } from './ConfirmDialog'
import { Icon } from './Icon'
import { PassPrompt } from './LockForm'
import { MarkupText } from './MarkupText'
import { ScheduleDialog, type ScheduleInit } from './ScheduleDialog'

// 타이핑마다 쓰면 통신이 잦고 무료 한도(쓰기 2만/일)도 금방 쓰므로 입력이 멈춘 뒤 한 번만 저장한다.
// 화면을 떠나거나 앱이 백그라운드로 가면 기다리지 않고 저장한다.
const SAVE_DELAY = 1000

interface Props {
  uid: string
  note: Note
  // 이 메모에 걸린 일정 (noteId가 이 메모인 것)
  schedules: Schedule[]
  onBack: () => void
  // 메모를 닫고 목록 대신 일정 화면으로 간다 (메인 창에서만)
  onSchedules?: () => void
  // 저장 대기 중(디바운스)인 입력이 있는지. 아직 서버로 가지 않았으니 "동기화됨"으로 보이면 안 된다.
  onTyping: (typing: boolean) => void
  // PC: 이 메모를 따로 창으로 띄운다
  onPopOut?: () => void
  // PC 메모 창: 편집 바가 창의 제목줄이 된다 (끌어서 옮기기, 닫기 버튼)
  standalone?: boolean
}

type Editing = { schedule: Schedule } | { init: ScheduleInit; line: number | null }

export function NoteEditor({ uid, note, schedules, onBack, onSchedules, onTyping, onPopOut, standalone }: Props) {
  const [draft, setDraft] = useState(note.text)
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  // 항목이 지워진 일정: 하나씩 일정도 지울지 묻는다
  const [missing, setMissing] = useState<Schedule[]>([])
  const latest = useRef(note.text)
  const dirty = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const area = useRef<HTMLTextAreaElement>(null)
  const mirror = useRef<HTMLDivElement>(null)
  const pointer = useRef('mouse')
  // 마지막 커서 자리. iOS는 편집 바 버튼을 누르면 textarea에서 포커스가 빠지며 커서 자리를 잃을 수 있어서 따로 기억한다.
  const caret = useRef<number | null>(null)
  // 한글 조합 중에는 커서를 옮기지 않는다
  const composing = useRef(false)
  // 체크박스를 누른 손가락 (손을 뗄 때 같은 상자면 체크를 바꾼다)
  const touch = useRef<{ x: number; y: number; line: number } | null>(null)
  // 마우스로 체크박스를 눌러 바꿨으면 뒤따르는 click은 무시한다
  const boxClicked = useRef(false)
  // 물어본 뒤 목록으로 돌아간다
  const leaving = useRef(false)
  // 잠금 버튼을 눌러 암호를 묻는 중: lock = 잠그기, open = 잠금 풀기
  const [locking, setLocking] = useState<'lock' | 'open' | null>(null)

  // 저장: 잠금 메모는 본문을 암호화해서 올린다 (lib/lock.ts). 제목은 암호화하지 않는다.
  const lockedRef = useRef(note.locked)
  lockedRef.current = note.locked
  const write = useCallback(
    (patch: { title?: string; text?: string }) => {
      if (!lockedRef.current || patch.text === undefined) return updateNote(uid, note.id, patch)
      updateLockedNote(uid, note.id, patch.text).catch((e) => console.error('[notes]', e))
    },
    [uid, note.id],
  )

  // 체크리스트 항목에 걸린 일정이 지금 몇째 줄에 있는지. 입력할 때마다 따라간다 (lib/markup.ts).
  const linked = useMemo(() => schedules.filter((s) => s.item !== null), [schedules])
  const lines = useRef<ItemLines>(new Map())
  const linkedRef = useRef(linked)
  linkedRef.current = linked

  // 새로 걸린 일정은 지금 글자에서 줄을 찾는다
  const fresh = linked.filter((s) => !lines.current.has(s.id))
  if (fresh.length) {
    const taken = new Set([...lines.current.values()].filter((k) => k !== null))
    const split = latest.current.split('\n')
    for (const s of fresh) {
      const k = findItemLine(split, s.item!, taken)
      if (k !== null) taken.add(k)
      lines.current.set(s.id, k)
    }
  }

  // 일정을 메모 글자에 맞춘다: 항목 글자·체크를 옮겨 적고, 항목이 사라진 일정을 돌려준다.
  const reconcile = useCallback((): Schedule[] => {
    const split = latest.current.split('\n')
    const taken = new Set([...lines.current.values()].filter((k) => k !== null))
    const gone: Schedule[] = []
    for (const s of linkedRef.current) {
      let k = lines.current.get(s.id) ?? null
      // 잘라 내서 다른 곳에 붙인 항목은 글자로 다시 찾는다
      if (k === null) {
        k = findItemLine(split, s.item!, taken)
        if (k !== null) {
          taken.add(k)
          lines.current.set(s.id, k)
        }
      }
      const item = k === null ? null : checklistItem(split[k] ?? '', k)
      if (!item) {
        gone.push(s)
        continue
      }
      // 글자를 다 지운 항목은 이름을 그대로 둔다
      const text = item.text || s.item!
      if (text !== s.item || item.done !== s.done) {
        updateSchedule(uid, s.id, { item: text, title: text, done: item.done })
      }
    }
    return gone
  }, [uid])

  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    if (!dirty.current) return []
    dirty.current = false
    onTyping(false)
    write({ text: latest.current })
    return reconcile()
  }, [onTyping, reconcile, write])

  // 편집 중이 아닐 때만 다른 기기에서 온 변경을 받아들인다.
  useEffect(() => {
    if (dirty.current || note.text === latest.current) return
    latest.current = note.text
    setDraft(note.text)
    lines.current = locateItems(
      note.text,
      linkedRef.current.map((s) => ({ id: s.id, item: s.item! })),
    )
  }, [note.text])

  // 화면을 떠나거나 앱이 백그라운드로 가면(모바일) 기다리지 않고 저장한다.
  // 이때는 물어볼 수 없으니 항목이 사라진 일정은 다음에 이 메모를 고칠 때 묻는다.
  useEffect(() => {
    const onVisibility = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  // 입력이 멈춰 저장할 때 항목이 사라진 일정을 묻는다
  const save = () => {
    const gone = flush()
    if (gone.length) setMissing(gone)
  }

  const change = (text: string) => {
    lines.current = shiftItems(latest.current, text, lines.current)
    setDraft(text)
    latest.current = text
    dirty.current = true
    onTyping(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(save, SAVE_DELAY)
  }

  // 체크리스트 편집. execCommand로 넣어야 Ctrl+Z로 되돌릴 수 있다.
  // focus=false: 입력 중이 아니면 포커스를 주지 않고 바꾼다 (휴대폰에서 체크박스만 눌렀는데 자판이 올라오지 않게)
  const apply = (make: (text: string, start: number, end: number) => Edit | null, focus = true) => {
    const ta = area.current
    if (!ta) return false
    const edit = make(ta.value, ta.selectionStart, ta.selectionEnd)
    if (!edit) return false
    if (!focus && document.activeElement !== ta) {
      ta.setRangeText(edit.text, edit.start, edit.end)
      change(ta.value)
      return true
    }
    ta.focus()
    ta.setSelectionRange(edit.start, edit.end)
    if (!document.execCommand(edit.text ? 'insertText' : 'delete', false, edit.text)) {
      ta.setRangeText(edit.text)
      change(ta.value)
    }
    ta.setSelectionRange(...edit.sel)
    return true
  }

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') return back()
    // 한글 조합 중의 Enter는 글자를 확정하는 키라서 건드리지 않는다
    if (e.nativeEvent.isComposing) return
    const mod = e.ctrlKey || e.metaKey
    const handled =
      mod && e.shiftKey && e.code === 'KeyL'
        ? apply(toggleChecklist)
        : e.key === 'Enter' && mod
          ? apply(toggleDone)
          : e.key === 'Enter' && !e.shiftKey && !e.altKey
            ? apply((text, start, end) => (start === end ? continueChecklist(text, start) : null))
            : false
    if (handled) e.preventDefault()
  }

  // 링크: PC는 Ctrl(⌘)+클릭, 터치는 그냥 누르면 연다.
  const click = (e: MouseEvent<HTMLTextAreaElement>) => {
    const ta = area.current
    if (boxClicked.current) {
      boxClicked.current = false
      return
    }
    if (e.detail !== 1 || !ta || ta.selectionStart !== ta.selectionEnd) return
    const url = linkAt(ta.value, ta.selectionStart)
    if (url && (e.ctrlKey || e.metaKey || pointer.current !== 'mouse')) {
      if (pointer.current !== 'mouse') ta.blur() // 휴대폰 자판이 올라오지 않게
      openUrl(url)
    }
  }

  // ── 체크박스 ──
  // 커서 자리로 판단하면 휴대폰에서는 손가락이 상자 옆 글자에 커서를 놓기 일쑤라, 화면에 그린 상자를 직접 찾는다.
  // 누른 상자는 커서를 옮기지 않고(휴대폰은 자판도 올리지 않고) 체크만 바꾼다.
  const boxAt = (x: number, y: number, slop: number): number | null => {
    for (const el of mirror.current?.querySelectorAll<HTMLElement>('.box') ?? []) {
      const r = el.getBoundingClientRect()
      if (x >= r.left - slop && x <= r.right + slop && y >= r.top - 2 && y <= r.bottom + 2) return Number(el.dataset.line)
    }
    return null
  }
  const toggleBox = (k: number) => {
    apply((text, start, end) => {
      const edit = toggleLine(text, k)
      return edit && { ...edit, sel: [start, end] }
    }, false)
  }
  const mouseDown = (e: MouseEvent<HTMLTextAreaElement>) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return
    const k = boxAt(e.clientX, e.clientY, 2)
    if (k === null) return
    e.preventDefault()
    boxClicked.current = true
    toggleBox(k)
  }
  const touchStart = (e: TouchEvent<HTMLTextAreaElement>) => {
    const t = e.touches[0]
    const k = e.touches.length === 1 ? boxAt(t.clientX, t.clientY, 8) : null
    touch.current = k === null ? null : { x: t.clientX, y: t.clientY, line: k }
  }
  const touchEnd = (e: TouchEvent<HTMLTextAreaElement>) => {
    const start = touch.current
    touch.current = null
    const t = e.changedTouches[0]
    if (!start || Math.abs(t.clientX - start.x) + Math.abs(t.clientY - start.y) > 10) return
    // 손을 뗀 뒤의 기본 동작(커서 놓기, 포커스, click)을 막는다
    e.preventDefault()
    toggleBox(start.line)
  }

  // 커서가 "- [ ] " 표기 안에 들어가지 않게 항목 글자 앞으로 옮긴다 (그 안에 글자를 넣거나 지우면 표기가 깨진다).
  // 항목 글자 맨 앞에서 ←로 옮기면 윗줄 끝으로 넘어간다.
  const select = () => {
    const ta = area.current
    if (!ta || document.activeElement !== ta) return
    let pos = ta.selectionStart
    if (pos === ta.selectionEnd && !composing.current) {
      const p = checkPrefix(ta.value, pos)
      if (p && pos < p.end) {
        pos = caret.current === p.end && pos === p.end - 1 && p.line > 0 ? p.line - 1 : p.end
        ta.setSelectionRange(pos, pos)
      }
    }
    caret.current = pos
  }

  // 지우기: 표기를 반쯤 지우지 않고 통째로 지운다. 휴대폰 자판은 keydown에 Backspace가 안 오기도 해서 beforeinput으로 받는다.
  const applyRef = useRef(apply)
  applyRef.current = apply
  useEffect(() => {
    const ta = area.current
    if (!ta) return
    const onBeforeInput = (e: InputEvent) => {
      const back = e.inputType === 'deleteContentBackward'
      if ((!back && e.inputType !== 'deleteContentForward') || e.isComposing) return
      if (ta.selectionStart !== ta.selectionEnd) return
      if (applyRef.current((text, start) => deletePrefix(text, start, back))) e.preventDefault()
    }
    ta.addEventListener('beforeinput', onBeforeInput)
    return () => ta.removeEventListener('beforeinput', onBeforeInput)
  }, [])

  // 복사·잘라내기: 다른 앱에 "- [ ]"가 붙지 않게 체크박스를 ☐/☑로 바꾼다. 붙여넣기는 되돌린다.
  const copy = (e: ClipboardEvent<HTMLTextAreaElement>, cut: boolean) => {
    const ta = e.currentTarget
    const { selectionStart: s, selectionEnd: t } = ta
    if (s === t) return
    const out = copyText(ta.value, s, t)
    if (out.start === s && out.text === ta.value.slice(s, t)) return
    e.preventDefault()
    e.clipboardData.setData('text/plain', out.text)
    if (cut) apply(() => ({ start: out.start, end: t, text: '', sel: [out.start, out.start] }))
  }
  const paste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const raw = e.clipboardData.getData('text/plain')
    const text = pasteText(raw)
    if (text === raw) return
    e.preventDefault()
    apply((_, s, t) => ({ start: s, end: t, text, sel: [s + text.length, s + text.length] }))
  }

  // 편집 버튼을 눌러도 textarea의 포커스와 선택 영역이 그대로 남게 한다
  const keepFocus = (e: MouseEvent) => e.preventDefault()

  const finishBack = () => {
    if (!latest.current.trim() && !note.title.trim()) deleteNote(uid, note.id)
    onBack()
  }

  const back = () => {
    const gone = flush()
    if (gone.length) {
      leaving.current = true
      setMissing(gone)
    } else finishBack()
  }

  // 항목이 사라진 일정 하나에 답했다
  const answerMissing = (s: Schedule, remove: boolean) => {
    lines.current.delete(s.id)
    if (remove) deleteSchedule(uid, s.id)
    else unlinkSchedule(uid, s.id)
    const rest = missing.slice(1)
    setMissing(rest)
    if (!rest.length && leaving.current) finishBack()
  }

  const popOut = () => {
    flush()
    onPopOut?.()
  }

  // 빈 메모는 묻지 않고 지운다
  const askRemove = () => (latest.current.trim() || schedules.length ? setConfirming(true) : remove(false))

  const remove = (withSchedules: boolean) => {
    window.clearTimeout(timer.current)
    dirty.current = false
    onTyping(false)
    for (const s of schedules) (withSchedules ? deleteSchedule : unlinkSchedule)(uid, s.id)
    deleteNote(uid, note.id)
    onBack()
  }

  // 일정 버튼: 커서가 있는 줄이 체크리스트 항목이면 그 항목에 일정을 건다 (이미 걸려 있으면 고친다).
  // 아니면 그 줄(빈 줄이면 메모 제목)을 이름으로 메모에 일정을 건다.
  const openSchedule = () => {
    const ta = area.current
    const text = latest.current
    const pos = ta && document.activeElement === ta ? ta.selectionStart : (caret.current ?? ta?.selectionStart ?? 0)
    const k = lineIndexAt(text, pos)
    const line = text.split('\n')[k] ?? ''
    const item = checklistItem(line, k)
    const existing = linked.find((s) => lines.current.get(s.id) === k)
    if (existing) return setEditing({ schedule: existing })
    if (item?.text) return setEditing({ init: { title: item.text, noteId: note.id, item: item.text }, line: k })
    const title = plain(line).trim() || note.title.trim() || plain(text.trim().split('\n')[0])
    setEditing({ init: { title, noteId: note.id, item: null }, line: null })
  }

  // 잠금 버튼: 암호를 확인한 뒤 잠그거나 잠금을 푼다
  const lock = () => {
    setLocking(null)
    flush()
    setNoteLocked(uid, note.id, true, latest.current).catch((e) => console.error('[lock]', e))
  }

  // 잠금 해제: 지금 글자를 원문 그대로 저장한다 (저장 대기 중이던 입력도 여기에 들어간다)
  const openLock = () => {
    setLocking(null)
    window.clearTimeout(timer.current)
    dirty.current = false
    onTyping(false)
    setNoteLocked(uid, note.id, false, latest.current).catch((e) => console.error('[lock]', e))
  }

  // 일정 창에서 지우기
  const removeSchedule = (s: Schedule, withItem: boolean) => {
    const k = lines.current.get(s.id)
    lines.current.delete(s.id)
    deleteSchedule(uid, s.id)
    if (!withItem || k == null) return
    // 그 줄을 지운다 (Ctrl+Z로 되돌릴 수 있게 apply로)
    apply((text) => {
      const split = text.split('\n')
      const start = split.slice(0, k).reduce((n, l) => n + l.length + 1, 0)
      const end = start + split[k].length
      return k < split.length - 1
        ? { start, end: end + 1, text: '', sel: [start, start] }
        : { start: Math.max(0, start - 1), end, text: '', sel: [Math.max(0, start - 1), Math.max(0, start - 1)] }
    })
  }

  // 줄 끝에 붙일 일정 시각 (끝낸 항목은 빼고)
  const alarms = new Map<number, string>()
  const draftLines = draft.split('\n')
  for (const s of linked) {
    const k = lines.current.get(s.id)
    if (k != null && checklistItem(draftLines[k] ?? '', k)?.done === false) alarms.set(k, formatWhen(s.at))
  }

  const firstLine = plain(draft.trim().split('\n')[0])

  return (
    <div className="editor">
      <div className="editor-bar">
        {!standalone && (
          <button className="icon-btn" onClick={back} title="목록으로 (Esc)">
            <Icon name="back" />
          </button>
        )}
        <TitleField
          title={note.title}
          placeholder={firstLine || '제목'}
          onSave={(title) => {
            if (title !== note.title) write({ title })
          }}
          onDone={() => area.current?.focus()}
        />
        <button
          className="icon-btn"
          onMouseDown={keepFocus}
          onClick={() => apply(toggleChecklist)}
          title="체크리스트 (Ctrl+Shift+L)"
        >
          <Icon name="checklist" />
        </button>
        {/* 잠금 메모는 일정을 걸지 않는다: 일정 이름(항목 글자)은 암호화되지 않아서 */}
        {!note.locked && (
          <button className="icon-btn" onMouseDown={keepFocus} onClick={openSchedule} title="일정 등록">
            <Icon name="bell" />
          </button>
        )}
        {onSchedules && (
          <button
            className="icon-btn"
            onClick={() => {
              onSchedules()
              back()
            }}
            title="일정 화면"
          >
            <Icon name="calendar" />
          </button>
        )}
        {onPopOut && !note.locked && (
          <button className="icon-btn" onClick={popOut} title="따로 띄우기">
            <Icon name="popout" />
          </button>
        )}
        <button
          className={`icon-btn${note.pinned ? ' active' : ''}`}
          onClick={() => updateNote(uid, note.id, { pinned: !note.pinned })}
          title="목록 상단에 고정"
        >
          <Icon name="star" filled={note.pinned} />
        </button>
        <button
          className={`icon-btn${note.locked ? ' active' : ''}`}
          onClick={() => setLocking(note.locked ? 'open' : 'lock')}
          title={note.locked ? '잠금 해제' : '잠그기 (본문 암호화)'}
        >
          <Icon name="lock" />
        </button>
        <button className="icon-btn" onClick={askRemove} title="삭제">
          <Icon name="trash" />
        </button>
        {standalone && (
          <button className="icon-btn" onClick={back} title="닫기 (Esc)">
            <Icon name="close" />
          </button>
        )}
      </div>
      {/* 투명한 textarea 뒤에 같은 글자를 그려서 체크박스와 링크를 보여준다 */}
      <div className="editor-body">
        <div className="mirror" ref={mirror} aria-hidden>
          <MarkupText text={draft} editor alarms={alarms} />{' '}
        </div>
        <textarea
          ref={area}
          autoFocus
          value={draft}
          placeholder="메모를 입력하세요"
          spellCheck={false}
          onChange={(e) => change(e.target.value)}
          onKeyDown={keyDown}
          onPointerDown={(e) => (pointer.current = e.pointerType)}
          onMouseDown={mouseDown}
          onTouchStart={touchStart}
          onTouchEnd={touchEnd}
          onClick={click}
          onSelect={select}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={() => (composing.current = false)}
          onCopy={(e) => copy(e, false)}
          onCut={(e) => copy(e, true)}
          onPaste={paste}
        />
      </div>
      {locking === 'lock' && (
        <PassPrompt
          uid={uid}
          message="이 메모를 잠글까요?"
          detail={
            '본문을 암호화합니다. 제목은 목록에 보이도록 암호화하지 않습니다.' +
            (schedules.length ? ` 걸려 있는 일정 ${schedules.length}개의 이름도 암호화되지 않습니다.` : '')
          }
          confirmLabel="잠그기"
          onDone={lock}
          onCancel={() => setLocking(null)}
        />
      )}
      {locking === 'open' && (
        <PassPrompt
          uid={uid}
          message="잠금을 풀까요?"
          detail="이 메모를 암호화하지 않고 저장합니다."
          confirmLabel="잠금 해제"
          onDone={openLock}
          onCancel={() => setLocking(null)}
        />
      )}
      {confirming &&
        (schedules.length ? (
          <ConfirmDialog
            message="이 메모를 삭제할까요?"
            detail={`걸려 있는 일정이 ${schedules.length}개 있습니다.`}
            altLabel="메모만 삭제"
            onAlt={() => remove(false)}
            confirmLabel="일정도 삭제"
            onConfirm={() => remove(true)}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          <ConfirmDialog
            message="이 메모를 삭제할까요?"
            confirmLabel="삭제"
            onConfirm={() => remove(false)}
            onCancel={() => setConfirming(false)}
          />
        ))}
      {missing.length > 0 && (
        <ConfirmDialog
          message="일정도 삭제할까요?"
          detail={`체크리스트 항목 '${missing[0].item}'이(가) 지워졌습니다.`}
          cancelLabel="일정 남기기"
          onCancel={() => answerMissing(missing[0], false)}
          confirmLabel="삭제"
          onConfirm={() => answerMissing(missing[0], true)}
        />
      )}
      {editing && (
        <ScheduleDialog
          uid={uid}
          {...('schedule' in editing ? { schedule: editing.schedule } : { init: editing.init })}
          onCreated={(id) => 'line' in editing && editing.line !== null && lines.current.set(id, editing.line)}
          onDelete={removeSchedule}
          onClose={() => {
            setEditing(null)
            area.current?.focus()
          }}
        />
      )}
    </div>
  )
}

interface TitleProps {
  title: string
  placeholder: string
  onSave: (title: string) => void
  onDone: () => void
}

// 제목: 누르면 입력칸이 된다. 비워 두면 내용의 첫 줄을 흐리게 보여준다.
// 평소에는 글자라서 PC 창에서는 잡고 끌어 창을 옮길 수 있다 (lib/widget.ts).
function TitleField({ title, placeholder, onSave, onDone }: TitleProps) {
  const [editing, setEditing] = useState(false)
  const cancel = useRef(false)

  if (!editing) {
    return (
      <span className={`note-title${title.trim() ? '' : ' placeholder'}`} onClick={() => setEditing(true)} title="제목 입력">
        {title.trim() || placeholder}
      </span>
    )
  }
  return (
    <input
      className="note-title"
      autoFocus
      defaultValue={title}
      placeholder={placeholder}
      enterKeyHint="done"
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => {
        if (!cancel.current) onSave(e.currentTarget.value.trim())
        cancel.current = false
        setEditing(false)
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Escape') cancel.current = true
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          e.currentTarget.blur()
          onDone()
        }
      }}
    />
  )
}
