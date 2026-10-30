import { useEffect, useRef, useState, type ReactNode } from 'react'
import { startOfDay, type Schedule } from '../lib/schedules'
import { Icon } from './Icon'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const monthFmt = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' })
const dayFmt = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const today = () => startOfDay()

interface Props {
  schedules: Schedule[]
  row: (s: Schedule) => ReactNode
  // 고른 날 (0시). 일정 화면을 나갔다 와도, 새 일정을 만들어도 이어지게 App이 갖는다.
  selected: Date
  onSelect: (d: Date) => void
}

// 이만큼(px) 넘게 옆으로 밀면 달을 넘긴다
const SWIPE = 50

/** 일정 달력: 날마다 일정 수만큼 점을 찍고, 고른 날의 일정을 아래에 보여준다. 옆으로 밀면 달을 넘긴다. */
export function ScheduleCalendar({ schedules, row, selected, onSelect }: Props) {
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1))
  // 넘긴 방향: 새 달이 그쪽에서 밀려 들어온다
  const [dir, setDir] = useState<'next' | 'prev' | null>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)

  const byDay = new Map<string, Schedule[]>()
  for (const s of schedules) {
    const k = dayKey(new Date(s.at))
    byDay.set(k, [...(byDay.get(k) ?? []), s])
  }

  // 1일이 든 주의 일요일부터 말일이 든 주의 토요일까지
  const y = month.getFullYear()
  const m = month.getMonth()
  const lead = month.getDay()
  const weeks = Math.ceil((lead + new Date(y, m + 1, 0).getDate()) / 7)
  const cells = Array.from({ length: weeks * 7 }, (_, i) => new Date(y, m, i - lead + 1))

  const show = (d: Date) => {
    const next = new Date(d.getFullYear(), d.getMonth(), 1)
    if (next.getTime() !== month.getTime()) setDir(next > month ? 'next' : 'prev')
    setMonth(next)
  }
  const move = (n: number) => show(new Date(y, m + n, 1))
  const pick = (d: Date) => {
    onSelect(d)
    show(d)
  }
  // 다른 달에 새 일정을 만들면 그 달로 넘어간다
  useEffect(() => {
    show(selected)
  }, [selected.getTime()])
  const todayKey = dayKey(today())
  const selectedKey = dayKey(selected)
  const dayList = byDay.get(selectedKey) ?? []

  return (
    <>
      <div className="schedule-bar">
        <button className="icon-btn" onClick={() => move(-1)} title="이전 달">
          <Icon name="back" />
        </button>
        <span className="cal-month">{monthFmt.format(month)}</span>
        <button className="icon-btn" onClick={() => move(1)} title="다음 달">
          <Icon name="forward" />
        </button>
        <button className="text-btn" onClick={() => pick(today())}>
          오늘
        </button>
      </div>
      <div
        key={month.getTime()}
        className={`cal-grid${dir ? ` slide-${dir}` : ''}`}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const start = touch.current
          touch.current = null
          if (!start) return
          const dx = e.changedTouches[0].clientX - start.x
          const dy = e.changedTouches[0].clientY - start.y
          // 위아래 스크롤과 헷갈리지 않게 옆으로 뚜렷이 민 것만
          if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1)
        }}
      >
        {WEEKDAYS.map((w) => (
          <span key={w} className="cal-week">
            {w}
          </span>
        ))}
        {cells.map((d) => {
          const k = dayKey(d)
          const items = byDay.get(k) ?? []
          const cls = [
            'cal-day',
            d.getMonth() !== m && 'other',
            d.getDay() === 0 && 'sun',
            k === todayKey && 'today',
            k === selectedKey && 'sel',
          ]
          return (
            <button key={k} className={cls.filter(Boolean).join(' ')} onClick={() => pick(d)}>
              {d.getDate()}
              <span className="cal-dots">
                {items.slice(0, 3).map((s) => (
                  <i key={s.id} className={s.done ? 'done' : ''} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
      <h3 className="list-head">{dayFmt.format(selected)}</h3>
      {dayList.map(row)}
      {dayList.length === 0 && <p className="cal-empty">일정 없음</p>}
    </>
  )
}
