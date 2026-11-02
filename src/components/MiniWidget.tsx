import { useEffect, useRef, useState } from 'react'
import { useArrivals, type BusFavorite } from '../lib/bus'
import { startOfDay, type Schedule } from '../lib/schedules'
import { MINI_SIZE, setMiniSize, setWidget } from '../lib/widget'
import { ArrivalGroups, NEAR_MIN, withEta } from './Bus'
import { Icon } from './Icon'

// 미니 위젯 창 폭 (논리 px). 높이는 내용에 맞춘다.
const WIDTH = 200
const weekdayFmt = new Intl.DateTimeFormat('ko-KR', { weekday: 'short' })
/** 2026년 11월 2일 (월) */
const formatDay = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdayFmt.format(d)})`
}

interface Props {
  schedules: Schedule[]
  favorites: BusFavorite[]
}

/**
 * PC 미니모드: 펼치기 버튼, 오늘 날짜, 오늘 일정을 끝낸 만큼 차는 막대, 즐겨찾기 버스 도착정보.
 * 미니모드가 아닐 때도 보이지 않게 그려 두고 높이를 재서 창 크기(lib/widget.ts)를 맞춘다.
 */
export function MiniWidget({ schedules, favorites }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const { byStop: arrivals, at } = useArrivals(favorites, true)
  // 자정이 지나면 날짜와 오늘 일정을 바꾼다
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

  const today = startOfDay(now).getTime()
  const todays = schedules.filter((s) => s.at >= today && s.at < today + 86_400_000)
  const done = todays.filter((s) => s.done).length
  const pct = todays.length ? Math.round((done / todays.length) * 100) : 0
  const { near } = withEta(favorites, arrivals)

  return (
    <div className="mini-widget" ref={ref} style={{ width: WIDTH }}>
      <div className="mini-head">
        <span className="mini-date">{formatDay(now)}</span>
        <button className="icon-btn" onClick={() => setWidget({ mini: false })} title="펼치기">
          <Icon name="expand" size={13} />
        </button>
      </div>
      <div className="mini-progress" title={todays.length ? `오늘 일정 ${todays.length}개 중 ${done}개 끝냄` : undefined}>
        <div className={`mini-bar${todays.length && done === todays.length ? ' full' : ''}`}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <span>{todays.length ? `일정 ${done}/${todays.length}` : '오늘 일정 없음'}</span>
      </div>
      {/* 버스: 10분 안에 오는 것만, 정류소별로 "106번 7분 후 도착" */}
      {favorites.length > 0 && at > 0 && (
        <div className="mini-bus">
          {near.length ? <ArrivalGroups entries={near} /> : <span className="mini-none">{NEAR_MIN}분 안에 오는 버스 없음</span>}
        </div>
      )}
    </div>
  )
}
