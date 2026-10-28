import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { deleteNote, NOTE_COLORS, updateNote, type Note } from '../lib/notes'
import { Icon } from './Icon'
import { noteStyle } from './noteStyle'

// 타이핑마다 쓰면 무료 한도(쓰기 2만/일)를 금방 쓰므로 입력이 멈춘 뒤 한 번만 저장한다.
const SAVE_DELAY = 600

interface Props {
  uid: string
  note: Note
  onBack: () => void
  // 저장 대기 중(디바운스)인 입력이 있는지. 아직 서버로 가지 않았으니 "동기화됨"으로 보이면 안 된다.
  onTyping: (typing: boolean) => void
}

export function NoteEditor({ uid, note, onBack, onTyping }: Props) {
  const [draft, setDraft] = useState(note.text)
  const [armed, setArmed] = useState(false)
  const latest = useRef(note.text)
  const dirty = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    if (!dirty.current) return
    dirty.current = false
    onTyping(false)
    updateNote(uid, note.id, { text: latest.current })
  }, [uid, note.id, onTyping])

  // 편집 중이 아닐 때만 다른 기기에서 온 변경을 받아들인다.
  useEffect(() => {
    if (dirty.current) return
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

  // 확인 대기 상태는 잠시 뒤 풀린다 (window.confirm은 일부 WebView에서 동작하지 않음).
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 2500)
    return () => window.clearTimeout(t)
  }, [armed])

  const change = (text: string) => {
    setDraft(text)
    latest.current = text
    dirty.current = true
    onTyping(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SAVE_DELAY)
  }

  const back = () => {
    flush()
    if (!latest.current.trim()) deleteNote(uid, note.id)
    onBack()
  }

  const remove = () => {
    if (latest.current.trim() && !armed) return setArmed(true)
    window.clearTimeout(timer.current)
    dirty.current = false
    onTyping(false)
    deleteNote(uid, note.id)
    onBack()
  }

  return (
    <div className="editor" style={noteStyle(note.color)}>
      <div className="editor-bar">
        <button className="icon-btn" onClick={back} title="목록으로 (Esc)">
          <Icon name="back" />
        </button>
        <div className="swatches">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              className={`swatch${c === note.color ? ' on' : ''}`}
              style={{ '--c': `var(--note-${c})` } as CSSProperties}
              onClick={() => updateNote(uid, note.id, { color: c })}
              aria-label={c}
            />
          ))}
        </div>
        <button
          className={`icon-btn${note.pinned ? ' active' : ''}`}
          onClick={() => updateNote(uid, note.id, { pinned: !note.pinned })}
          title="목록 상단에 고정"
        >
          <Icon name="star" filled={note.pinned} />
        </button>
        <button className={`icon-btn${armed ? ' danger' : ''}`} onClick={remove} title={armed ? '한 번 더 누르면 삭제' : '삭제'}>
          <Icon name="trash" />
        </button>
      </div>
      <textarea
        autoFocus
        value={draft}
        placeholder="메모를 입력하세요"
        spellCheck={false}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && back()}
      />
    </div>
  )
}
