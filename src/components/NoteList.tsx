import { formatDate } from '../lib/formatDate'
import { CHECK, locateItems, plain } from '../lib/markup'
import type { Note } from '../lib/notes'
import type { Schedule } from '../lib/schedules'
import { Icon } from './Icon'
import { MarkupText } from './MarkupText'

interface Props {
  notes: Note[]
  schedules: Schedule[]
  loaded: boolean
  query: string
  onOpen: (id: string) => void
  // 휴대폰: 아이폰 메모앱처럼 고정됨·메모로 묶은 한 줄짜리 목록. 아니면(PC) 본문 두 줄이 보이는 카드.
  rows?: boolean
}

// 따로 적은 제목이 없으면 첫 줄이 제목이고 나머지가 본문이다.
// 잠금 메모는 본문을 보이지 않는다. 따로 적은 제목이 없으면 "잠긴 메모"로 보인다.
function split(n: Note) {
  const [first, ...rest] = n.text.trim().split('\n')
  const title = n.title.trim() || (n.locked ? '잠긴 메모' : plain(first))
  const body = n.locked ? '' : (n.title.trim() ? n.text : rest.join('\n')).trim()
  return { title: title || '빈 메모', body }
}

/** 메모 목록. 부르는 쪽이 .list로 감싼다 (PC는 일정 달력 아래에 이어 붙인다). */
export function NoteList({ notes, schedules, loaded, query, onOpen, rows = false }: Props) {
  const q = query.trim().toLowerCase()
  const shown = q ? notes.filter((n) => `${n.title}\n${n.text}`.toLowerCase().includes(q)) : notes
  const linkedOf = (n: Note) =>
    schedules.flatMap((s) => (s.noteId === n.id && s.item !== null ? [{ id: s.id, item: s.item }] : []))

  const empty = loaded && shown.length === 0 && (
    <p className="empty">{q ? '검색 결과가 없습니다' : '+ 버튼으로 첫 메모를 만드세요'}</p>
  )

  if (rows) {
    const pinned = q ? [] : shown.filter((n) => n.pinned)
    const rest = q ? shown : shown.filter((n) => !n.pinned)
    const group = (label: string, list: Note[]) =>
      list.length > 0 && (
        <section className="note-group">
          {label && <h3 className="list-head">{label}</h3>}
          <div className="rows">{list.map((n) => row(n))}</div>
        </section>
      )
    const row = (n: Note) => {
      const { title, body } = split(n)
      // 둘째 줄: 날짜 · 체크리스트 진행(2/5) · 본문 첫 부분
      const lines = body ? body.split('\n') : []
      const items = lines.filter((l) => CHECK.test(l))
      const done = items.filter((l) => CHECK.exec(l)![2] !== ' ').length
      const preview = lines
        .map((l) => plain(l).trim())
        .filter(Boolean)
        .join(' ')
      const pending = schedules.some((s) => s.noteId === n.id && !s.done)
      return (
        <button key={n.id} className="row" onClick={() => onOpen(n.id)}>
          <span className="row-head">
            {n.locked && <Icon name="lock" size={12} />}
            <span className="row-title">{title}</span>
            {pending && (
              <span className="scheduled" title="일정">
                <Icon name="calendar" size={12} />
              </span>
            )}
          </span>
          <span className="row-sub">
            <span className="row-date">{formatDate(n.updatedAt)}</span>
            {items.length > 0 && (
              <span className={`row-progress${done === items.length ? ' all' : ''}`}>
                {done}/{items.length}
              </span>
            )}
            <span className="row-preview">{n.locked ? '잠김' : preview || '추가 텍스트 없음'}</span>
          </span>
        </button>
      )
    }
    return (
      <>
        {group('고정됨', pinned)}
        {group(q ? '검색 결과' : '메모', rest)}
        {empty}
      </>
    )
  }

  return (
    <>
      {shown.map((n) => {
        const { title, body } = split(n)
        // 일정이 걸린 체크리스트 항목을 본문에서 찾아 표시한다
        const linked = linkedOf(n)
        const scheduled = new Set<number>()
        if (body && linked.length) for (const k of locateItems(body, linked).values()) if (k !== null) scheduled.add(k)
        return (
          <button key={n.id} className="card" onClick={() => onOpen(n.id)}>
            <div className="card-head">
              {n.pinned && <Icon name="star" size={11} filled />}
              {n.locked && <Icon name="lock" size={11} />}
              <span className="card-title">{title}</span>
              <span className="card-date">{formatDate(n.updatedAt)}</span>
            </div>
            {body && (
              <div className="card-body">
                <MarkupText text={body} scheduled={scheduled} />
              </div>
            )}
          </button>
        )
      })}
      {empty}
    </>
  )
}
