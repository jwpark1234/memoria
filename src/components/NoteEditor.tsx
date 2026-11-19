import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { linkAt, plain } from '../lib/markup'
import { deleteNote, setNoteLocked, updateLockedNote, updateNote, type Note } from '../lib/notes'
import { openUrl } from '../lib/openUrl'
import { macDesktop } from '../lib/platform'
import { ConfirmDialog } from './ConfirmDialog'
import { Icon } from './Icon'
import { PassPrompt } from './LockForm'
import { MarkupText } from './MarkupText'
import { TrafficLights } from './TrafficLights'

// 타이핑마다 쓰면 통신이 잦고 무료 한도(쓰기 2만/일)도 금방 쓰므로 입력이 멈춘 뒤 한 번만 저장한다.
// 화면을 떠나거나 앱이 백그라운드로 가면 기다리지 않고 저장한다.
const SAVE_DELAY = 1000

interface Props {
  uid: string
  note: Note
  onBack: () => void
  // 저장 대기 중(디바운스)인 입력이 있는지. 아직 서버로 가지 않았으니 "동기화됨"으로 보이면 안 된다.
  onTyping: (typing: boolean) => void
  // PC: 이 메모를 따로 창으로 띄운다
  onPopOut?: () => void
  // PC 메모 창: 편집 바가 창의 제목줄이 된다 (끌어서 옮기기, 닫기 버튼)
  standalone?: boolean
}

/** 메모 편집기. 메모는 그냥 글이다 (할 일은 할일 목록, 시각은 일정에 둔다). 링크만 표시한다. */
export function NoteEditor({ uid, note, onBack, onTyping, onPopOut, standalone }: Props) {
  const [draft, setDraft] = useState(note.text)
  const [confirming, setConfirming] = useState(false)
  const latest = useRef(note.text)
  const dirty = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const area = useRef<HTMLTextAreaElement>(null)
  const pointer = useRef('mouse')
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

  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    if (!dirty.current) return
    dirty.current = false
    onTyping(false)
    write({ text: latest.current })
  }, [onTyping, write])

  // 편집 중이 아닐 때만 다른 기기에서 온 변경을 받아들인다.
  useEffect(() => {
    if (dirty.current || note.text === latest.current) return
    latest.current = note.text
    setDraft(note.text)
  }, [note.text])

  // 화면을 떠나거나 앱이 백그라운드로 가면(모바일) 기다리지 않고 저장한다.
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

  const change = (text: string) => {
    setDraft(text)
    latest.current = text
    dirty.current = true
    onTyping(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SAVE_DELAY)
  }

  // 링크: PC는 Ctrl(⌘)+클릭, 터치는 그냥 누르면 연다.
  const click = (e: MouseEvent<HTMLTextAreaElement>) => {
    const ta = area.current
    if (e.detail !== 1 || !ta || ta.selectionStart !== ta.selectionEnd) return
    const url = linkAt(ta.value, ta.selectionStart)
    if (url && (e.ctrlKey || e.metaKey || pointer.current !== 'mouse')) {
      if (pointer.current !== 'mouse') ta.blur() // 휴대폰 자판이 올라오지 않게
      openUrl(url)
    }
  }

  const back = () => {
    flush()
    if (!latest.current.trim() && !note.title.trim()) deleteNote(uid, note.id)
    onBack()
  }

  const popOut = () => {
    flush()
    onPopOut?.()
  }

  // 빈 메모는 묻지 않고 지운다
  const askRemove = () => (latest.current.trim() ? setConfirming(true) : remove())

  const remove = () => {
    window.clearTimeout(timer.current)
    dirty.current = false
    onTyping(false)
    deleteNote(uid, note.id)
    onBack()
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

  const firstLine = plain(draft.trim().split('\n')[0])

  return (
    <div className="editor">
      <div className="editor-bar">
        {/* 따로 띄운 메모 창: macOS는 왼쪽 빨강 신호등이 닫기 */}
        {standalone && macDesktop && <TrafficLights onClose={back} />}
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
        {standalone && !macDesktop && (
          <button className="icon-btn" onClick={back} title="닫기 (Esc)">
            <Icon name="close" />
          </button>
        )}
      </div>
      {/* 투명한 textarea 뒤에 같은 글자를 그려서 링크를 보여준다 */}
      <div className="editor-body">
        <div className="mirror" aria-hidden>
          <MarkupText text={draft} />{' '}
        </div>
        <textarea
          ref={area}
          autoFocus
          value={draft}
          placeholder="메모를 입력하세요"
          spellCheck={false}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && back()}
          onPointerDown={(e) => (pointer.current = e.pointerType)}
          onClick={click}
        />
      </div>
      {locking === 'lock' && (
        <PassPrompt
          uid={uid}
          message="이 메모를 잠글까요?"
          detail="본문을 암호화합니다. 제목은 목록에 보이도록 암호화하지 않습니다."
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
      {confirming && (
        <ConfirmDialog
          message="이 메모를 삭제할까요?"
          confirmLabel="삭제"
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
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
