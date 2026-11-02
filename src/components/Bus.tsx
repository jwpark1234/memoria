import { useState } from 'react'
import {
  sameFavorite,
  searchStops,
  setBusFavorites,
  stopArrivals,
  useArrivals,
  useBusFavorites,
  type Arrival,
  type BusFavorite,
  type Stop,
} from '../lib/bus'
import { useOverlayClose } from '../lib/overlay'
import { Icon } from './Icon'

const timeFmt = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' })

// 노선 번호 색: 부산 버스 차체 색을 따른다
function lineKind(bustype = '') {
  if (/급행|좌석|직행/.test(bustype)) return 'express'
  if (/마을/.test(bustype)) return 'town'
  if (/심야/.test(bustype)) return 'night'
  return ''
}

/** "3분 (2정거장) · 15분" */
function arrivalText(a: Arrival | undefined): string {
  if (!a) return '도착 정보 없음'
  const [first, second] = a.buses
  if (!first) return a.status || '도착 정보 없음'
  const soon = (first.min ?? 99) <= 1 || first.stops === 1 ? '곧 도착' : `${first.min}분`
  const where = first.stops ? ` (${first.stops}정거장)` : ''
  return `${soon}${where}${second?.min != null ? ` · ${second.min}분` : ''}`
}

/** 즐겨찾기한 버스의 도착정보. 즐겨찾기가 없으면 아무것도 그리지 않는다 (설정 메뉴에서 추가). */
export function BusPanel({ uid }: { uid: string }) {
  const favorites = useBusFavorites(uid)
  const arrivals = useArrivals(favorites)
  const [editing, setEditing] = useState(false)
  if (!favorites.length) return null

  const { byStop, at, error, loading, paused, refresh } = arrivals
  const note = paused
    ? '멈춤 · 누르면 새로 고침'
    : error
      ? `받지 못함 · ${error}`
      : at
        ? `${timeFmt.format(at)} 기준`
        : '불러오는 중…'

  return (
    <section className="bus">
      <div className="bus-head">
        <h3 className="list-head">버스</h3>
        <span className={`bus-note${error ? ' error' : ''}`} title={note}>
          {note}
        </span>
        <button className={`icon-btn${loading ? ' spin' : ''}`} onClick={refresh} title="새로 고침">
          <Icon name="refresh" size={14} />
        </button>
        <button className="icon-btn" onClick={() => setEditing(true)} title="버스 즐겨찾기 편집">
          <Icon name="pencil" size={14} />
        </button>
      </div>
      <div className="bus-rows">
        {favorites.map((f) => {
          const a = byStop[f.bstopid]?.find((x) => x.lineid === f.lineid)
          const first = a?.buses[0]
          return (
            <button key={`${f.bstopid}-${f.lineid}`} className="bus-row" onClick={refresh} title="새로 고침">
              <span className={`bus-no ${lineKind(a?.bustype)}`}>{f.lineno}</span>
              <span className="bus-stop">{f.stop}</span>
              <span className={`bus-when${first && (first.min ?? 99) <= 3 ? ' soon' : ''}`}>
                {at || error ? arrivalText(a) : '…'}
                {first?.low && <span className="bus-low">저상</span>}
              </span>
            </button>
          )
        })}
      </div>
      {editing && <BusDialog uid={uid} onClose={() => setEditing(false)} />}
    </section>
  )
}

/** 버스 즐겨찾기 편집: 정류소를 찾아 고르고, 그 정류소에 서는 노선을 눌러 넣고 뺀다. */
export function BusDialog({ uid, onClose }: { uid: string; onClose: () => void }) {
  const favorites = useBusFavorites(uid)
  const overlay = useOverlayClose(onClose)
  const [q, setQ] = useState('')
  const [stops, setStops] = useState<Stop[] | null>(null)
  const [stop, setStop] = useState<Stop | null>(null)
  const [lines, setLines] = useState<Arrival[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    if (!q.trim()) return
    setStop(null)
    setLines(null)
    run(() => searchStops(q.trim()), setStops)
  }

  const pick = (s: Stop) => {
    setStop(s)
    setLines(null)
    run(
      () => stopArrivals(s.bstopid),
      (list) => setLines([...list].sort((a, b) => a.lineno.localeCompare(b.lineno, 'ko', { numeric: true }))),
    )
  }

  const toggle = (s: Stop, a: Arrival) => {
    const key = { bstopid: s.bstopid, lineid: a.lineid }
    const next = favorites.some((f) => sameFavorite(f, key))
      ? favorites.filter((f) => !sameFavorite(f, key))
      : [...favorites, { bstopid: s.bstopid, arsno: s.arsno, stop: s.name, lineid: a.lineid, lineno: a.lineno }]
    setBusFavorites(uid, next)
  }

  const remove = (f: BusFavorite) => setBusFavorites(uid, favorites.filter((x) => !sameFavorite(x, f)))

  return (
    <div className="overlay" {...overlay}>
      <div className="dialog form bus-dialog" role="dialog" aria-modal aria-label="버스 즐겨찾기" onClick={(e) => e.stopPropagation()}>
        <p>버스 즐겨찾기</p>

        {favorites.length > 0 && (
          <ul className="bus-favs">
            {favorites.map((f) => (
              <li key={`${f.bstopid}-${f.lineid}`}>
                <span className="bus-no">{f.lineno}</span>
                <span className="bus-stop">
                  {f.stop} <small>{f.arsno}</small>
                </span>
                <button className="icon-btn" onClick={() => remove(f)} title="빼기">
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="bus-search"
          onSubmit={(e) => {
            e.preventDefault()
            search()
          }}
        >
          <input
            className="search"
            type="search"
            enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="정류소 이름 또는 번호(5자리)"
            autoFocus={!favorites.length}
          />
          <button type="submit" className="text-btn" disabled={busy}>
            찾기
          </button>
        </form>

        {error && <p className="detail error">{error}</p>}

        {stop ? (
          <>
            <button className="bus-back" onClick={() => setStop(null)}>
              <Icon name="back" size={14} />
              {stop.name} <small>{stop.arsno}</small>
            </button>
            {lines && lines.length === 0 && <p className="detail">이 정류소에 서는 노선이 없습니다</p>}
            {lines && (
              <div className="bus-lines">
                {lines.map((a) => {
                  const on = favorites.some((f) => sameFavorite(f, { bstopid: stop.bstopid, lineid: a.lineid }))
                  return (
                    <button
                      key={a.lineid}
                      className={`bus-line${on ? ' on' : ''}`}
                      onClick={() => toggle(stop, a)}
                      title={on ? '즐겨찾기에서 빼기' : '즐겨찾기에 넣기'}
                    >
                      <span className={`bus-no ${lineKind(a.bustype)}`}>{a.lineno}</span>
                      <span className="bus-when">{arrivalText(a)}</span>
                      <Icon name={on ? 'star' : 'plus'} size={13} filled={on} />
                    </button>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          stops && (
            <ul className="bus-stops">
              {stops.length === 0 && <li className="detail">찾는 정류소가 없습니다</li>}
              {stops.map((s) => (
                <li key={s.bstopid}>
                  <button onClick={() => pick(s)}>
                    {s.name} <small>{s.arsno}</small>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
        {busy && <p className="detail">불러오는 중…</p>}

        <div className="dialog-actions">
          <button className="ok" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
