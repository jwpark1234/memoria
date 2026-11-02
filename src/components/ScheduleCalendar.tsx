import { useEffect, useRef, useState, type ReactNode } from 'react'
import { startOfDay, type Schedule } from '../lib/schedules'
import { Icon } from './Icon'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const monthFmt = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' })
const dayFmt = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const today = () => startOfDay()
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const weekStart = (d: Date) => addDays(d, -d.getDay())
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

// 접기·펴기는 기기마다 기억한다
const EXPANDED_KEY = 'memoria.calendarExpanded'
function loadExpanded(fallback: boolean) {
  try {
    const v = localStorage.getItem(EXPANDED_KEY)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

interface Props {
  schedules: Schedule[]
  row: (s: Schedule) => ReactNode
  // 고른 날 (0시). 일정 화면을 나갔다 와도, 새 일정을 만들어도 이어지게 App이 갖는다.
  selected: Date
  onSelect: (d: Date) => void
  // 있으면 고른 날 제목 옆에 일정 추가 버튼
  onAdd?: () => void
  // 처음에 한 달을 펴 둘지 (PC는 펴고, 휴대폰은 일주일로 접어 둔다). 손잡이로 접고 펴고, 기기마다 기억한다.
  defaultExpanded?: boolean
  collapsible?: boolean
}

// 이만큼(px) 넘게 옆으로 밀면 넘긴다
const SWIPE = 50

/**
 * 일정 달력. 접으면 고른 날이 든 일주일, 펴면 한 달. 날마다 일정 수만큼 점을 찍고 고른 날의 일정을 아래에 보여준다.
 * 옆으로 밀면 (접었을 때는 주, 폈을 때는 달을) 넘긴다.
 */
export function ScheduleCalendar({
  schedules,
  row,
  selected,
  onSelect,
  onAdd,
  defaultExpanded = false,
  collapsible = true,
}: Props) {
  const [open, setExpanded] = useState(() => loadExpanded(defaultExpanded))
  const expanded = !collapsible || open
  // 보여주는 기간 안의 아무 날 (주 보기면 그 주, 달 보기면 그 달)
  const [anchor, setAnchor] = useState(selected)
  // 넘긴 방향: 새 기간이 그쪽에서 밀려 들어온다
  const [dir, setDir] = useState<'next' | 'prev' | null>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)

  const byDay = new Map<string, Schedule[]>()
  for (const s of schedules) {
    const k = dayKey(new Date(s.at))
    byDay.set(k, [...(byDay.get(k) ?? []), s])
  }

  const start = expanded ? monthStart(anchor) : weekStart(anchor)
  // 달 보기: 1일이 든 주의 일요일부터 말일이 든 주의 토요일까지
  const m = anchor.getMonth()
  const lead = start.getDay()
  const weeks = expanded ? Math.ceil((lead + new Date(start.getFullYear(), m + 1, 0).getDate()) / 7) : 1
  const first = expanded ? addDays(start, -lead) : start
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(first, i))
  // 주 보기의 달 이름은 그 주의 목요일 기준 (주가 두 달에 걸칠 때)
  const label = monthFmt.format(expanded ? start : addDays(start, 4))

  const periodOf = (d: Date, exp = expanded) => (exp ? monthStart(d) : weekStart(d)).getTime()
  const show = (d: Date) => {
    const next = periodOf(d)
    const now = periodOf(anchor)
    if (next !== now) setDir(next > now ? 'next' : 'prev')
    setAnchor(d)
  }
  const move = (n: number) => show(expanded ? new Date(start.getFullYear(), m + n, 1) : addDays(start, n * 7))
  const pick = (d: Date) => {
    onSelect(d)
    show(d)
  }
  const toggle = () => {
    const next = !expanded
    setExpanded(next)
    setDir(null)
    setAnchor(selected) // 펴고 접어도 고른 날이 보이게
    try {
      localStorage.setItem(EXPANDED_KEY, next ? '1' : '0')
    } catch {
      // 이번 실행 동안만 기억한다
    }
  }
  // 다른 날에 새 일정을 만들면 그 날로 넘어간다
  useEffect(() => {
    show(selected)
  }, [selected.getTime()])

  const todayKey = dayKey(today())
  const selectedKey = dayKey(selected)
  const dayList = byDay.get(selectedKey) ?? []

  return (
    <>
      <div className="cal">
        <div className="schedule-bar">
          {collapsible ? (
            <button className="cal-month" onClick={toggle} title={expanded ? '일주일로 접기' : '한 달 펴기'}>
              {label}
              <span className={`cal-caret${expanded ? ' up' : ''}`}>
                <Icon name="forward" size={12} />
              </span>
            </button>
          ) : (
            <span className="cal-month">{label}</span>
          )}
          <span className="grow" />
          <button className="text-btn" onClick={() => pick(today())}>
            오늘
          </button>
          <button className="icon-btn" onClick={() => move(-1)} title={expanded ? '이전 달' : '이전 주'}>
            <Icon name="back" />
          </button>
          <button className="icon-btn" onClick={() => move(1)} title={expanded ? '다음 달' : '다음 주'}>
            <Icon name="forward" />
          </button>
        </div>
        <div
          key={`${expanded}-${start.getTime()}`}
          className={`cal-grid${dir ? ` slide-${dir}` : ''}`}
          onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
          onTouchEnd={(e) => {
            const t0 = touch.current
            touch.current = null
            if (!t0) return
            const dx = e.changedTouches[0].clientX - t0.x
            const dy = e.changedTouches[0].clientY - t0.y
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
              expanded && d.getMonth() !== m && 'other',
              d.getDay() === 0 && 'sun',
              k === todayKey && 'today',
              k === selectedKey && 'sel',
            ]
            return (
              <button key={k} className={cls.filter(Boolean).join(' ')} onClick={() => pick(d)}>
                <span className="cal-num">{d.getDate()}</span>
                <span className="cal-dots">
                  {items.slice(0, 3).map((s) => (
                    <i key={s.id} className={s.done ? 'done' : ''} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
        {/* 손잡이: 눌러서 접고 편다 */}
        {collapsible && (
          <button className="cal-handle" onClick={toggle} aria-label={expanded ? '일주일로 접기' : '한 달 펴기'}>
            <i />
          </button>
        )}
      </div>
      <div className="day-head">
        <h3 className="list-head">{dayFmt.format(selected)}</h3>
        {onAdd && (
          <button className="text-btn" onClick={onAdd} title="이 날에 일정 추가">
            <Icon name="plus" size={13} />
            일정
          </button>
        )}
      </div>
      {dayList.map(row)}
      {dayList.length === 0 && <p className="cal-empty">일정 없음</p>}
    </>
  )
}
