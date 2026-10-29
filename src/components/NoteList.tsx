import { formatDate } from '../lib/formatDate'
import { plain } from '../lib/markup'
import type { Note } from '../lib/notes'
import { Icon } from './Icon'
import { MarkupText } from './MarkupText'

interface Props {
  notes: Note[]
  loaded: boolean
  query: string
  onOpen: (id: string) => void
}

export function NoteList({ notes, loaded, query, onOpen }: Props) {
  const q = query.trim().toLowerCase()
  const shown = q ? notes.filter((n) => `${n.title}\n${n.text}`.toLowerCase().includes(q)) : notes

  return (
    <div className="list">
      {shown.map((n) => {
        // 따로 적은 제목이 없으면 첫 줄이 제목이고 나머지가 본문이다.
        // 잠금 메모는 본문을 보이지 않는다. 따로 적은 제목이 없으면 "잠긴 메모"로 보인다.
        const [first, ...rest] = n.text.trim().split('\n')
        const title = n.title.trim() || (n.locked ? '잠긴 메모' : plain(first))
        const body = n.locked ? '' : (n.title.trim() ? n.text : rest.join('\n')).trim()
        return (
          <button key={n.id} className="card" onClick={() => onOpen(n.id)}>
            <div className="card-head">
              {n.pinned && <Icon name="star" size={11} filled />}
              {n.locked && <Icon name="lock" size={11} />}
              <span className="card-title">{title || '빈 메모'}</span>
              <span className="card-date">{formatDate(n.updatedAt)}</span>
            </div>
            {body && (
              <div className="card-body">
                <MarkupText text={body} />
              </div>
            )}
          </button>
        )
      })}
      {loaded && shown.length === 0 && (
        <p className="empty">{q ? '검색 결과가 없습니다' : '+ 버튼으로 첫 메모를 만드세요'}</p>
      )}
    </div>
  )
}
