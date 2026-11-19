import { useState } from 'react'
import { deleteSchedule, formatWhen, startOfDay, updateSchedule, type Schedule } from '../lib/schedules'
import { shortcutLabel } from '../lib/shortcuts'
import { Icon } from './Icon'
import { rowClick } from './TodoList'
import { ScheduleCalendar } from './ScheduleCalendar'
import { ScheduleDialog } from './ScheduleDialog'

interface Props {
  uid: string
  schedules: Schedule[]
  day: Date
  onDay: (d: Date) => void
  // 고른 날의 제목 옆에 일정 추가 버튼
  onAdd?: () => void
  defaultExpanded?: boolean
}

const timeFmt = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' })

/** 일정 달력과 고른 날의 일정. 부르는 쪽이 .list로 감싼다. */
export function ScheduleList({ uid, schedules, day, onDay, onAdd, defaultExpanded }: Props) {
  const [editing, setEditing] = useState<Schedule | null>(null)
  const now = Date.now()

  const row = (s: Schedule) => (
    <div key={s.id} className={`schedule${s.done ? ' done' : ''}`} {...rowClick(() => setEditing(s))}>
      <button
        className={`check${s.done ? ' on' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          updateSchedule(uid, s.id, { done: !s.done })
        }}
        title={s.done ? '다시 하기' : '끝냄'}
      />
      <span className="schedule-main">
        <span className="schedule-title">{s.title || '일정'}</span>
        <span className={`schedule-when${!s.done && s.at < now ? ' late' : ''}`}>{timeFmt.format(s.at)}</span>
      </span>
    </div>
  )

  return (
    <>
      <ScheduleCalendar
        schedules={schedules}
        row={row}
        selected={day}
        onSelect={onDay}
        onAdd={onAdd}
        defaultExpanded={defaultExpanded}
      />
      {editing && (
        <ScheduleDialog
          uid={uid}
          schedule={schedules.find((s) => s.id === editing.id) ?? editing}
          onDelete={(s) => deleteSchedule(uid, s.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

// 메인 화면에 보일 일정 수
const SUMMARY = 5

interface SummaryProps {
  uid: string
  schedules: Schedule[]
  day: Date // 달력에서 고른 날 (0시)
  onDay: (d: Date) => void
  onAdd?: () => void // 고른 날로 일정 등록 (없으면 등록 줄을 숨긴다: 휴대폰 홈은 + 버튼으로)
  limit?: number
  week?: boolean // 달력을 이번 주 한 줄로 (휴대폰 홈)
}

/** 메인 화면의 일정 칸: 한 달 달력, + 일정 등록, 고른 날(처음엔 오늘)부터 다가오는 끝내지 않은 일정 SUMMARY개 */
export function ScheduleSummary({ uid, schedules, day, onDay, onAdd, limit = SUMMARY, week = false }: SummaryProps) {
  const [editing, setEditing] = useState<Schedule | null>(null)
  const from = startOfDay(day.getTime()).getTime()
  const now = Date.now()
  const hint = shortcutLabel('schedule')
  const upcoming = schedules.filter((s) => !s.done && s.at >= from).slice(0, limit) // schedules는 시각순
  return (
    <>
      <ScheduleCalendar
        schedules={schedules}
        row={() => null}
        selected={day}
        onSelect={onDay}
        collapsible={false}
        gridOnly
        week={week}
      />
      {onAdd && (
      <button className="home-add" onClick={onAdd} title={hint ? `일정 등록 (${hint})` : undefined}>
        <Icon name="plus" size={13} />
        일정 등록
        {hint && <kbd className="kbd">{hint}</kbd>}
      </button>
      )}
      {upcoming.map((s) => (
        <div key={s.id} className="schedule" {...rowClick(() => setEditing(s))}>
          <button
            className="check"
            onClick={(e) => {
              e.stopPropagation()
              updateSchedule(uid, s.id, { done: true })
            }}
            title="끝냄"
          />
          <span className="schedule-main">
            <span className="schedule-title">{s.title || '일정'}</span>
            <span className={`schedule-when${s.at < now ? ' late' : ''}`}>{formatWhen(s.at)}</span>
          </span>
        </div>
      ))}
      {upcoming.length === 0 && <p className="cal-empty">{from === startOfDay().getTime() ? '오늘부터' : '이날부터'} 다가오는 일정 없음</p>}
      {editing && (
        <ScheduleDialog
          uid={uid}
          schedule={schedules.find((s) => s.id === editing.id) ?? editing}
          onDelete={(s) => deleteSchedule(uid, s.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
