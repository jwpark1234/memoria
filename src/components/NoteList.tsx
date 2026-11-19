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
  // 휴대폰: 아이폰 메모앱처럼 고정됨·메모로 묶은 한 줄짜리 목록. 아니면(PC) 본문 두 줄이 보이는 카드.
  rows?: boolean
  // 메인 화면 요약: 앞에서 이만큼만 (고정한 메모·최근 메모 순), 제목과 날짜만 한 줄씩
  limit?: number
  compact?: boolean
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
export function NoteList({ notes, loaded, query, onOpen, rows = false, limit, compact = false }: Props) {
  const q = query.trim().toLowerCase()
  const shown = (q ? notes.filter((n) => `${n.title}\n${n.text}`.toLowerCase().includes(q)) : notes).slice(0, limit)

  const empty = loaded && shown.length === 0 && (
    <p className="empty">{q ? '검색 결과가 없습니다' : '+ 버튼으로 첫 메모를 만드세요'}</p>
  )

  if (compact) {
    return shown.map((n) => (
      <button key={n.id} className="home-row" onClick={() => onOpen(n.id)}>
        {n.pinned && <Icon name="star" size={11} filled />}
        {n.locked && <Icon name="lock" size={11} />}
        <span className="home-row-title">{split(n).title}</span>
        <span className="home-row-date">{formatDate(n.updatedAt)}</span>
      </button>
    ))
  }

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
      // 둘째 줄: 날짜 · 본문 첫 부분
      const preview = (body ? body.split('\n') : [])
        .map((l) => plain(l).trim())
        .filter(Boolean)
        .join(' ')
      return (
        <button key={n.id} className="row" onClick={() => onOpen(n.id)}>
          <span className="row-head">
            {n.locked && <Icon name="lock" size={12} />}
            <span className="row-title">{title}</span>
          </span>
          <span className="row-sub">
            <span className="row-date">{formatDate(n.updatedAt)}</span>
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
                <MarkupText text={body} />
              </div>
            )}
          </button>
        )
      })}
      {empty}
    </>
  )
}
