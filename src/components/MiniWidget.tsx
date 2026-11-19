import { useEffect, useRef, useState } from 'react'
import { useArrivals, type BusFavorite } from '../lib/bus'
import { formatWhen, type Schedule } from '../lib/schedules'
import type { Todo } from '../lib/todos'
import { MINI_SIZE, setMiniSize, setWidget } from '../lib/widget'
import { BusTicker, withEta } from './Bus'
import { Icon } from './Icon'

// 미니 위젯 창 폭 (논리 px). 높이는 내용에 맞춘다.
const WIDTH = 200
const weekdayFmt = new Intl.DateTimeFormat('ko-KR', { weekday: 'short' })
/** 11/2 월 */
const formatDay = (ms: number) => {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()} ${weekdayFmt.format(d)}`
}

interface Props {
  schedules: Schedule[]
  todos: Todo[]
  favorites: BusFavorite[]
  // 할일 개수를 누르면: 펼쳐서 할일 페이지로
  onOpenTodos: () => void
}

/**
 * PC 미니모드: 흘끗 보고 지금 신경 쓸 게 있는지만. 시간에 민감한 것 위주로 작게.
 * 첫 줄 날짜 · 진행 중 할일 개수 · 펼치기, 둘째 줄 다음 일정(늘 한 줄), 그 아래 즐겨찾기 정류소마다 흐르는 버스 줄.
 * 미니모드가 아닐 때도 보이지 않게 그려 두고 높이를 재서 창 크기(lib/widget.ts)를 맞춘다.
 */
export function MiniWidget({ schedules, todos, favorites, onOpenTodos }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const { byStop: arrivals, at } = useArrivals(favorites, true)
  // 1분마다: 자정이 지나면 날짜를, 일정 시각이 지나면 다음 일정을 바꾼다
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  // 로그인 전의 원형 아이콘(MiniBubble) 대신 이 위젯을 쓴다
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('mini-widget-on')
    return () => {
      root.classList.remove('mini-widget-on')
      setMiniSize({ width: MINI_SIZE, height: MINI_SIZE })
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => setMiniSize({ width: WIDTH, height: Math.ceil(el.getBoundingClientRect().height) })
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    fit()
    return () => observer.disconnect()
  }, [])

  // 다음 일정: 지금 이후의 끝내지 않은 일정 중 가장 이른 것 (schedules는 시각순)
  const next = schedules.find((s) => !s.done && s.at >= now)
  const left = todos.filter((t) => t.doneAt === null).length

  return (
    <div className="mini-widget" ref={ref} style={{ width: WIDTH }}>
      <div className="mini-head">
        <span className="mini-date">{formatDay(now)}</span>
        <button
          className="mini-todos"
          onClick={() => {
            onOpenTodos()
            setWidget({ mini: false })
          }}
          title="진행 중인 할일 (누르면 할일 페이지)"
        >
          할일 <b>{left}</b>
        </button>
        <button className="icon-btn" onClick={() => setWidget({ mini: false })} title="펼치기">
          <Icon name="expand" size={11} />
        </button>
      </div>
      <div className={`mini-next${next ? '' : ' none'}`} title={next ? `${formatWhen(next.at)} ${next.title}` : undefined}>
        <Icon name="calendar" size={11} />
        {next ? (
          <>
            <span className="mini-next-when">{formatWhen(next.at)}</span>
            <span className="mini-next-title">{next.title || '일정'}</span>
          </>
        ) : (
          <span>다음 일정 없음</span>
        )}
      </div>
      {/* 버스: 즐겨찾기한 정류소마다 흐르는 한 줄 */}
      {favorites.length > 0 && at > 0 && (
        <div className="mini-bus">
          <BusTicker entries={withEta(favorites, arrivals)} />
        </div>
      )}
    </div>
  )
}
