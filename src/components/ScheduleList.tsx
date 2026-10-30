import { useState } from 'react'
import { noteTitle, removeItem, setItemDone } from '../lib/markup'
import { updateLockedNote, updateNote, type Note } from '../lib/notes'
import { deleteSchedule, formatWhen, updateSchedule, type Schedule } from '../lib/schedules'
import { Icon } from './Icon'
import { ScheduleCalendar } from './ScheduleCalendar'
import { ScheduleDialog } from './ScheduleDialog'

interface Props {
  uid: string
  schedules: Schedule[]
  notes: Note[]
  onOpenNote: (id: string) => void
  day: Date
  onDay: (d: Date) => void
}

/** 일정 화면: 달력과 고른 날의 일정 */
export function ScheduleList({ uid, schedules, notes, onOpenNote, day, onDay }: Props) {
  const [editing, setEditing] = useState<Schedule | null>(null)
  const noteOf = (s: Schedule) => (s.noteId ? notes.find((n) => n.id === s.noteId) : undefined)

  // 메모 속 항목을 고친다. 잠금 메모는 풀려 있을 때만 암호화해서 고치고, 잠겨 있으면 건드리지 않는다.
  const editNote = (note: Note, text: string) => {
    if (!note.locked) updateNote(uid, note.id, { text })
    else if (!note.sealed) updateLockedNote(uid, note.id, text).catch(() => {})
  }

  // 체크리스트 항목에 걸린 일정은 메모 속 항목의 체크도 같이 바꾼다
  const toggle = (s: Schedule) => {
    updateSchedule(uid, s.id, { done: !s.done })
    const note = noteOf(s)
    if (note && s.item !== null) editNote(note, setItemDone(note.text, s.item, !s.done))
  }

  const remove = (s: Schedule, withItem: boolean) => {
    deleteSchedule(uid, s.id)
    const note = noteOf(s)
    if (withItem && note && s.item !== null) editNote(note, removeItem(note.text, s.item))
  }

  const now = Date.now()

  const row = (s: Schedule) => {
    const note = noteOf(s)
    return (
      <div key={s.id} className={`schedule${s.done ? ' done' : ''}`}>
        <button className={`check${s.done ? ' on' : ''}`} onClick={() => toggle(s)} title={s.done ? '다시 하기' : '끝냄'} />
        <button className="schedule-main" onClick={() => setEditing(s)}>
          <span className="schedule-title">{s.title || '일정'}</span>
          <span className={`schedule-when${!s.done && s.at < now ? ' late' : ''}`}>{formatWhen(s.at)}</span>
        </button>
        {note && (
          <button className="icon-btn" onClick={() => onOpenNote(note.id)} title={`메모 열기: ${noteTitle(note) || '빈 메모'}`}>
            <Icon name="note" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="list">
      <ScheduleCalendar schedules={schedules} row={row} selected={day} onSelect={onDay} />
      {editing && (
        <ScheduleDialog
          uid={uid}
          schedule={schedules.find((s) => s.id === editing.id) ?? editing}
          onDelete={remove}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
