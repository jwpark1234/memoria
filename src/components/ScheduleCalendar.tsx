import { useState, type ReactNode } from 'react'
import type { Schedule } from '../lib/schedules'
import { Icon } from './Icon'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const monthFmt = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' })
const dayFmt = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const today = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

interface Props {
  schedules: Schedule[]
  row: (s: Schedule) => ReactNode
  // 머리줄 오른쪽에 붙일 것 (목록/달력 전환)
  bar: ReactNode
}

/** 일정 달력: 날마다 일정 수만큼 점을 찍고, 고른 날의 일정을 아래에 보여준다 */
export function ScheduleCalendar({ schedules, row, bar }: Props) {
  const [selected, setSelected] = useState(today)
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1))

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

  const move = (n: number) => setMonth(new Date(y, m + n, 1))
  const pick = (d: Date) => {
    setSelected(d)
    if (d.getMonth() !== m) setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
  }
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
        {bar}
      </div>
      <div className="cal-grid">
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
