import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteNote, updateNote, type Note } from '../lib/notes'
import { ConfirmDialog } from './ConfirmDialog'
import { Icon } from './Icon'

// 타이핑마다 쓰면 무료 한도(쓰기 2만/일)를 금방 쓰므로 입력이 멈춘 뒤 한 번만 저장한다.
const SAVE_DELAY = 600

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

export function NoteEditor({ uid, note, onBack, onTyping, onPopOut, standalone }: Props) {
  const [draft, setDraft] = useState(note.text)
  const [confirming, setConfirming] = useState(false)
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

  const drag = standalone ? { 'data-tauri-drag-region': true } : {}
  const title = draft.trim().split('\n')[0] || '새 메모'

  return (
    <div className="editor">
      <div className="editor-bar" {...drag}>
        {standalone ? (
          <span className="note-title" {...drag}>
            {title}
          </span>
        ) : (
          <button className="icon-btn" onClick={back} title="목록으로 (Esc)">
            <Icon name="back" />
          </button>
        )}
        {onPopOut && (
          <button className="icon-btn push" onClick={popOut} title="따로 띄우기">
            <Icon name="popout" />
          </button>
        )}
        <button
          className={`icon-btn${onPopOut || standalone ? '' : ' push'}${note.pinned ? ' active' : ''}`}
          onClick={() => updateNote(uid, note.id, { pinned: !note.pinned })}
          title="목록 상단에 고정"
        >
          <Icon name="star" filled={note.pinned} />
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
      <textarea
        autoFocus
        value={draft}
        placeholder="메모를 입력하세요"
        spellCheck={false}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && back()}
      />
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
