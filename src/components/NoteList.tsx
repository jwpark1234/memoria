import { useEffect, useState } from 'react'
import { formatDate } from '../lib/formatDate'
import type { Note } from '../lib/notes'
import { Icon } from './Icon'
import { noteStyle } from './noteStyle'

interface Props {
  notes: Note[]
  loaded: boolean
  onOpen: (id: string) => void
  searching: boolean
  onSearchEnd: () => void
}

export function NoteList({ notes, loaded, onOpen, searching, onSearchEnd }: Props) {
  const [query, setQuery] = useState('')
  // 검색창을 닫으면 검색어도 지운다
  useEffect(() => {
    if (!searching) setQuery('')
  }, [searching])

  const q = query.trim().toLowerCase()
  const shown = q ? notes.filter((n) => n.text.toLowerCase().includes(q)) : notes

  return (
    <>
      {searching && (
        <input
          autoFocus
          className="search"
          placeholder="검색 (Esc로 닫기)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onSearchEnd()}
        />
      )}
      <div className="list">
        {shown.map((n) => {
          const [title, ...rest] = n.text.trim().split('\n')
          const body = rest.join('\n').trim()
          return (
            <button key={n.id} className="card" style={noteStyle(n.color)} onClick={() => onOpen(n.id)}>
              <div className="card-head">
                {n.pinned && <Icon name="star" size={11} filled />}
                <span className="card-title">{title || '빈 메모'}</span>
                <span className="card-date">{formatDate(n.updatedAt)}</span>
              </div>
              {body && <div className="card-body">{body}</div>}
            </button>
          )
        })}
        {loaded && shown.length === 0 && (
          <p className="empty">{q ? '검색 결과가 없습니다' : '+ 버튼으로 첫 메모를 만드세요'}</p>
        )}
      </div>
    </>
  )
}
