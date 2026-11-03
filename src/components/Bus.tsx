import { useEffect, useState, type ReactNode } from 'react'
import {
  lineRoute,
  sameFavorite,
  searchKinds,
  searchLines,
  searchStops,
  setBusFavorites,
  stopArrivals,
  useArrivals,
  type Arrival,
  type BusFavorite,
  type Line,
  type RouteStop,
  type Stop,
} from '../lib/bus'
import { useOverlayClose } from '../lib/overlay'
import { Icon } from './Icon'


// 노선 번호 색: 부산 버스 차체 색을 따른다
function lineKind(bustype = '') {
  if (/급행|좌석|직행/.test(bustype)) return 'express'
  if (/마을/.test(bustype)) return 'town'
  if (/심야/.test(bustype)) return 'night'
  return ''
}

export function LineNo({ no, type }: { no: string; type?: string }) {
  return <span className={`bus-no ${lineKind(type)}`}>{no}</span>
}

/** 도착 표시: main은 오른쪽에 크게(4분 / 곧 도착), sub는 가운데에 작게(3정거장 전 · 다음 17분 · 저상) */
export function eta(a: Arrival | undefined): { main: string; sub: string; tone: 'soon' | 'near' | 'none' | '' } {
  if (!a) return { main: '–', sub: '도착 정보 없음', tone: 'none' }
  const [b1, b2] = a.buses
  if (!b1) return { main: a.status || '–', sub: a.status ? '' : '도착 정보 없음', tone: 'none' }
  const min = b1.min ?? 99
  const soon = min <= 1 || b1.stops === 1
  const sub = [b1.stops != null && `${b1.stops}정거장 전`, b2?.min != null && `다음 ${b2.min}분`, b1.low && '저상']
    .filter(Boolean)
    .join(' · ')
  return { main: soon ? '곧 도착' : `${min}분`, sub, tone: soon ? 'soon' : min <= 5 ? 'near' : '' }
}

type Entry = { f: BusFavorite; a: Arrival | undefined; e: ReturnType<typeof eta>; min: number | null }

/** 정류소별로 묶는다. 묶음 순서는 들어온 순서 (near는 남은 시간순이라 곧 오는 버스가 있는 정류소가 앞으로) */
function byStop(entries: Entry[]) {
  const groups: { bstopid: string; stop: string; items: Entry[] }[] = []
  for (const x of entries) {
    const g = groups.find((y) => y.bstopid === x.f.bstopid)
    if (g) g.items.push(x)
    else groups.push({ bstopid: x.f.bstopid, stop: x.f.stop, items: [x] })
  }
  return groups
}

/** "7분 후 도착" / "곧 도착" / "운행대기" — 강조할 부분(strong)과 나머지 */
function arrivalWords({ a, min }: Entry): { strong: string; rest: string } {
  const first = a?.buses[0]
  if (first && min !== null) return min <= 1 || first.stops === 1 ? { strong: '곧 도착', rest: '' } : { strong: `${min}분`, rest: ' 후 도착' }
  return { strong: '', rest: a?.status || '정보 없음' }
}

/** 정류소마다 한 줄: "부산시청  1001번 곧 도착 · 106번 8분 후 도착" */
export function StopLines({ entries }: { entries: Entry[] }) {
  return byStop(entries).map((g) => (
    <div key={g.bstopid} className="bus-line">
      <span className="bus-line-stop">{g.stop}</span>
      {g.items.map((x) => {
        const w = arrivalWords(x)
        return (
          <span key={x.f.lineid} className={`bus-line-item ${x.e.tone}`}>
            {x.f.lineno}번 {w.strong && <b>{w.strong}</b>}
            {w.rest}
          </span>
        )
      })}
    </div>
  ))
}

/** 이 시간(분) 안에 오는 버스만 보인다 (배너를 펴면 전부) */
export const NEAR_MIN = 10

/** 즐겨찾기마다 도착정보를 붙인다. near: NEAR_MIN 안에 오는 것만 남은 시간순으로 */
export function withEta(favorites: BusFavorite[], arrivals: Record<string, Arrival[]>) {
  const all: Entry[] = favorites.map((f) => {
    const a = arrivals[f.bstopid]?.find((x) => x.lineid === f.lineid)
    return { f, a, e: eta(a), min: a?.buses[0]?.min ?? null }
  })
  const near = all.filter((x) => x.min !== null && x.min <= NEAR_MIN).sort((x, y) => x.min! - y.min!)
  return { all, near }
}

/**
 * 화면 맨 아래의 버스 배너. 일정·메모가 주인공이라 버스는 한두 줄로만: 10분 안에 오는 버스를 정류소별로.
 * 누르면 즐겨찾기 전부를 펴고 접는다 (멈춰 있었으면 새로 받는다). 편집은 상단 버스 버튼에서.
 */
export function BusBanner({ favorites }: { favorites: BusFavorite[] }) {
  const { byStop: arrivals, at, error, paused, refresh } = useArrivals(favorites)
  const [open, setOpen] = useState(false)
  const { all, near } = withEta(favorites, arrivals)
  const shown = open ? all : near

  return (
    <div
      className={`bus-banner${open ? ' open' : ''}`}
      role="button"
      aria-expanded={open}
      title={open ? '접기' : '전체 보기'}
      onClick={() => {
        setOpen(!open)
        if (paused || error) refresh()
      }}
    >
      <Icon name="bus" size={13} />
      <div className="bus-lines">
        {!at ? (
          <span className="bus-none">{error ? '버스 정보를 받지 못함' : '…'}</span>
        ) : shown.length ? (
          <StopLines entries={shown} />
        ) : (
          <span className="bus-none">{NEAR_MIN}분 내 도착 없음</span>
        )}
      </div>
      <span className={`cal-caret${open ? '' : ' up'}`}>
        <Icon name="forward" size={10} />
      </span>
    </div>
  )
}

// ── 추가·편집 시트 ──────────────────────────────────────────────────────

type Page = { kind: 'home' } | { kind: 'stop'; stop: Stop } | { kind: 'line'; line: Line }

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="sheet-section">
      {title && <h3 className="list-head">{title}</h3>}
      <div className="sheet-list">{children}</div>
    </section>
  )
}

/** 추가 버튼: 넣었으면 ✓ 추가됨 */
function AddPill({ on }: { on: boolean }) {
  return (
    <span className={`pill${on ? ' on' : ''}`}>
      <Icon name={on ? 'check' : 'plus'} size={12} />
      {on ? '추가됨' : '추가'}
    </span>
  )
}

/**
 * 버스 즐겨찾기 시트: 검색창 하나로 정류소 이름·정류소 번호·버스 번호를 찾는다.
 * 정류소를 고르면 그 정류소에 서는 버스를, 버스를 고르면 방향별 정류소를 보여주고 눌러서 넣고 뺀다.
 */
export function BusSheet({ uid, favorites, onClose }: { uid: string; favorites: BusFavorite[]; onClose: () => void }) {
  const overlay = useOverlayClose(onClose)
  const [page, setPage] = useState<Page>({ kind: 'home' })
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ q: string; stops: Stop[]; lines: Line[] } | null>(null)
  const [arrivals, setArrivals] = useState<Arrival[] | null>(null)
  const [routeStops, setRouteStops] = useState<RouteStop[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 검색어를 지우면 즐겨찾기 목록으로 돌아간다
  useEffect(() => {
    if (!q.trim()) setResults(null)
  }, [q])

  const run = async <T,>(job: () => Promise<T>, done: (v: T) => void) => {
    setBusy(true)
    setError(null)
    try {
      done(await job())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const search = () => {
    const text = q.trim()
    if (!text) return
    ;(document.activeElement as HTMLElement | null)?.blur() // 휴대폰 자판을 내려 결과가 보이게
    const kinds = searchKinds(text)
    run(
      () =>
        Promise.all([
          kinds.stops ? searchStops(text) : Promise.resolve([]),
          kinds.lines ? searchLines(text) : Promise.resolve([]),
        ]),
      ([stops, lines]) => setResults({ q: text, stops, lines }),
    )
  }

  const openStop = (stop: Stop) => {
    setPage({ kind: 'stop', stop })
    setArrivals(null)
    run(
      () => stopArrivals(stop.bstopid),
      (list) => setArrivals([...list].sort((a, b) => a.lineno.localeCompare(b.lineno, 'ko', { numeric: true }))),
    )
  }

  const openLine = (line: Line) => {
    setPage({ kind: 'line', line })
    setRouteStops(null)
    run(() => lineRoute(line.lineid), setRouteStops)
  }

  const has = (bstopid: string, lineid: string) => favorites.some((f) => sameFavorite(f, { bstopid, lineid }))
  const toggle = (f: BusFavorite) =>
    setBusFavorites(uid, has(f.bstopid, f.lineid) ? favorites.filter((x) => !sameFavorite(x, f)) : [...favorites, f])

  const back = () => {
    setPage({ kind: 'home' })
    setError(null)
  }

  const title =
    page.kind === 'stop' ? page.stop.name : page.kind === 'line' ? `${page.line.lineno}번` : '버스 즐겨찾기'
  const subtitle =
    page.kind === 'stop' ? `정류소 ${page.stop.arsno}` : page.kind === 'line' ? `${page.line.start} ↔ ${page.line.end}` : ''

  let body: ReactNode
  if (page.kind === 'stop') {
    const { stop } = page
    body = arrivals && (
      <Section title="이 정류소에 서는 버스">
        {arrivals.length === 0 && <p className="sheet-note">서는 버스가 없습니다</p>}
        {arrivals.map((a) => {
          const on = has(stop.bstopid, a.lineid)
          const e = eta(a)
          return (
            <button
              key={a.lineid}
              className="sheet-item"
              onClick={() => toggle({ bstopid: stop.bstopid, arsno: stop.arsno, stop: stop.name, lineid: a.lineid, lineno: a.lineno })}
            >
              <LineNo no={a.lineno} type={a.bustype} />
              <span className="sheet-main">
                <small>{e.main === '–' ? e.sub : `${e.main}${e.sub ? ` · ${e.sub}` : ''}`}</small>
              </span>
              <AddPill on={on} />
            </button>
          )
        })}
      </Section>
    )
  } else if (page.kind === 'line') {
    const { line } = page
    // 회차 지점까지는 종점 방면, 그 뒤는 기점 방면
    const turn = routeStops ? routeStops.findIndex((s) => s.turn) : -1
    const legs = routeStops
      ? turn >= 0
        ? [
            { title: `${line.end} 방면`, stops: routeStops.slice(0, turn + 1) },
            { title: `${line.start} 방면`, stops: routeStops.slice(turn + 1) },
          ]
        : [{ title: '정류소', stops: routeStops }]
      : []
    body = legs.map(
      (leg) =>
        leg.stops.length > 0 && (
          <Section key={leg.title} title={leg.title}>
            {leg.stops.map((s, i) => {
              const on = has(s.bstopid, line.lineid)
              return (
                <button
                  key={`${s.bstopid}-${i}`}
                  className="sheet-item"
                  onClick={() => toggle({ bstopid: s.bstopid, arsno: s.arsno, stop: s.name, lineid: line.lineid, lineno: line.lineno })}
                >
                  <span className="sheet-main">
                    <span>{s.name}</span>
                    <small>{s.arsno}</small>
                  </span>
                  <AddPill on={on} />
                </button>
              )
            })}
          </Section>
        ),
    )
  } else if (results) {
    const none = !results.stops.length && !results.lines.length
    body = (
      <>
        {none && !busy && <p className="sheet-note">'{results.q}'에 맞는 정류소나 버스가 없습니다</p>}
        {results.lines.length > 0 && (
          <Section title="버스">
            {results.lines.map((l) => (
              <button key={l.lineid} className="sheet-item" onClick={() => openLine(l)}>
                <LineNo no={l.lineno} type={l.bustype} />
                <span className="sheet-main">
                  <small>
                    {l.start} ↔ {l.end}
                  </small>
                </span>
                <Icon name="forward" size={14} />
              </button>
            ))}
          </Section>
        )}
        {results.stops.length > 0 && (
          <Section title="정류소">
            {results.stops.map((s) => (
              <button key={s.bstopid} className="sheet-item" onClick={() => openStop(s)}>
                <span className="sheet-main">
                  <span>{s.name}</span>
                  <small>{s.arsno}</small>
                </span>
                <Icon name="forward" size={14} />
              </button>
            ))}
          </Section>
        )}
      </>
    )
  } else {
    body = favorites.length ? (
      <Section title="내 즐겨찾기">
        {favorites.map((f) => (
          <div key={`${f.bstopid}-${f.lineid}`} className="sheet-item">
            <LineNo no={f.lineno} />
            <span className="sheet-main">
              <span>{f.stop}</span>
              <small>{f.arsno}</small>
            </span>
            <button className="remove" onClick={() => toggle(f)} title="빼기" aria-label={`${f.lineno}번 ${f.stop} 빼기`}>
              <Icon name="minus" size={14} />
            </button>
          </div>
        ))}
      </Section>
    ) : (
      <p className="sheet-note">
        정류소 이름이나 번호, 버스 번호로 찾아서
        <br />
        자주 타는 버스를 추가하세요
      </p>
    )
  }

  return (
    <div className="overlay sheet-overlay" {...overlay}>
      <div className="sheet" role="dialog" aria-modal aria-label="버스 즐겨찾기" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          {page.kind !== 'home' ? (
            <button className="icon-btn" onClick={back} title="뒤로">
              <Icon name="back" />
            </button>
          ) : (
            <span />
          )}
          <div className="sheet-title">
            <strong>{title}</strong>
            {subtitle && <small>{subtitle}</small>}
          </div>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <Icon name="close" />
          </button>
        </header>
        {page.kind === 'home' && (
          <form
            className="sheet-search"
            onSubmit={(e) => {
              e.preventDefault()
              search()
            }}
          >
            <Icon name="search" size={15} />
            <input
              type="search"
              enterKeyHint="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="정류소 이름·번호, 버스 번호"
              autoFocus={!favorites.length}
            />
            {q && (
              <button type="submit" className="text-btn" disabled={busy}>
                검색
              </button>
            )}
          </form>
        )}
        <div className="sheet-body">
          {error && <p className="sheet-note error">{error}</p>}
          {busy && <p className="sheet-note">불러오는 중…</p>}
          {body}
        </div>
      </div>
    </div>
  )
}
