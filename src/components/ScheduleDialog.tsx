import { useState } from 'react'
import { askNotifyPermission } from '../lib/alarms'
import { registerPush } from '../lib/push'
import { useOverlayClose } from '../lib/overlay'
import { createSchedule, nextHour, toLocalInput, updateSchedule, type Schedule } from '../lib/schedules'
import { ConfirmDialog } from './ConfirmDialog'

// at: 기본 시각 (없으면 다음 정각)
export type ScheduleInit = Pick<Schedule, 'title'> & { at?: number }

interface Props {
  uid: string
  // 고칠 일정. 없으면 init으로 새로 만든다.
  schedule?: Schedule
  init?: ScheduleInit
  onCreated?: (id: string, at: number) => void
  // 지우기는 부르는 쪽이 한다
  onDelete?: (s: Schedule) => void
  onClose: () => void
}

/** 일정 등록·수정 창 */
export function ScheduleDialog({ uid, schedule, init, onCreated, onDelete, onClose }: Props) {
  const base = schedule ?? { title: '', ...init }
  const [title, setTitle] = useState(base.title)
  const [when, setWhen] = useState(toLocalInput(schedule?.at ?? init?.at ?? nextHour()))
  const [confirming, setConfirming] = useState(false)
  const overlay = useOverlayClose(onClose)
  const at = new Date(when).getTime()

  const save = () => {
    if (Number.isNaN(at)) return
    // 처음 일정을 저장할 때 알림 권한을 묻고, 휴대폰이면 푸시를 받을 수 있게 등록한다
    askNotifyPermission()
      .then(() => registerPush(uid))
      .catch(() => {})
    if (schedule) {
      updateSchedule(uid, schedule.id, {
        title: title.trim(),
        at,
        // 시각을 옮기면 다시 알린다 (앱 알림과 푸시 모두)
        ...(at !== schedule.at && { notified: false, pushed: false }),
      })
    } else {
      onCreated?.(createSchedule(uid, { title: title.trim(), at }), at)
    }
    onClose()
  }

  if (confirming && schedule) {
    return (
      <ConfirmDialog
        message="일정을 삭제할까요?"
        confirmLabel="삭제"
        onConfirm={() => {
          onDelete?.(schedule)
          onClose()
        }}
        onCancel={() => setConfirming(false)}
      />
    )
  }

  return (
    <div className="overlay" {...overlay}>
      <form
        className="dialog form"
        role="dialog"
        aria-modal
        aria-label={schedule ? '일정 수정' : '일정 등록'}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <p>{schedule ? '일정 수정' : '일정 등록'}</p>
        <label className="field">
          <span>내용</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="일정" />
        </label>
        <label className="field">
          <span>알림 시각</span>
          <input type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <div className="dialog-actions">
          {schedule && onDelete && (
            <button type="button" className="danger-text" onClick={() => setConfirming(true)}>
              삭제
            </button>
          )}
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="ok" disabled={Number.isNaN(at)}>
            저장
          </button>
        </div>
      </form>
    </div>
  )
}
