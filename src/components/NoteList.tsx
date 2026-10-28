import { formatDate } from '../lib/formatDate'
import type { Note } from '../lib/notes'
import { Icon } from './Icon'

interface Props {
  notes: Note[]
  loaded: boolean
  query: string
  onOpen: (id: string) => void
}

export function NoteList({ notes, loaded, query, onOpen }: Props) {
  const q = query.trim().toLowerCase()
  const shown = q ? notes.filter((n) => n.text.toLowerCase().includes(q)) : notes

  return (
    <div className="list">
      {shown.map((n) => {
        const [title, ...rest] = n.text.trim().split('\n')
        const body = rest.join('\n').trim()
        return (
          <button key={n.id} className="card" onClick={() => onOpen(n.id)}>
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
  )
}
