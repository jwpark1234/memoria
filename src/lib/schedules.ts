import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from './firebase'

// 일정. 직접 등록하거나, 메모의 체크리스트 항목에 걸어 둔다.
// 항목에 걸린 일정은 항목 글자(item)로 메모 속 줄을 찾는다. 편집기가 항목을 고치면 같이 고친다 (NoteEditor).
export interface Schedule {
  id: string
  title: string
  at: number // 알림 시각 (ms)
  done: boolean // 끝냄. 알리지 않는다. 걸린 체크리스트 항목의 체크와 같다.
  notified: boolean // 이미 알렸음. 다른 기기가 또 알리지 않게 서버에 둔다.
  pushed?: boolean // 푸시 Worker(push/)가 휴대폰에 보냈음. 앱은 읽지 않고, 시각을 옮길 때만 되돌린다.
  noteId: string | null // 걸린 메모
  item: string | null // 걸린 체크리스트 항목의 글자 (noteId 메모 안)
}

type SchedulePatch = Partial<Omit<Schedule, 'id'>>

const schedulesCol = (uid: string) => collection(db, 'users', uid, 'schedules')

// 쓰기는 await하지 않는다 (lib/notes.ts와 같은 방식)
const report = (e: unknown) => console.error('[schedules]', e)

const toFirestore = (patch: SchedulePatch) => {
  const { at, ...rest } = patch
  return at === undefined ? rest : { ...rest, at: Timestamp.fromMillis(at) }
}

export function useSchedules(uid: string) {
  const [schedules, setSchedules] = useState<Schedule[]>([])

  useEffect(() => {
    const q = query(schedulesCol(uid), where('deleted', '==', false))
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            title: data.title ?? '',
            at: (data.at as Timestamp | null)?.toMillis() ?? 0,
            done: !!data.done,
            notified: !!data.notified,
            noteId: data.noteId ?? null,
            item: data.item ?? null,
          } satisfies Schedule
        })
        list.sort((a, b) => a.at - b.at)
        setSchedules(list)
      },
      report,
    )
  }, [uid])

  return schedules
}

export function createSchedule(uid: string, s: Omit<Schedule, 'id' | 'done' | 'notified' | 'pushed'>): string {
  const ref = doc(schedulesCol(uid))
  setDoc(ref, {
    ...toFirestore({ ...s, done: false, notified: false, pushed: false }),
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }).catch(report)
  return ref.id
}

export function updateSchedule(uid: string, id: string, patch: SchedulePatch) {
  updateDoc(doc(schedulesCol(uid), id), { ...toFirestore(patch), updatedAt: serverTimestamp() }).catch(report)
}

// 메모처럼 플래그만 세운다
export function deleteSchedule(uid: string, id: string) {
  updateDoc(doc(schedulesCol(uid), id), { deleted: true, updatedAt: serverTimestamp() }).catch(report)
}

/** 메모·항목과의 연결만 끊고 일정은 남긴다 */
export const unlinkSchedule = (uid: string, id: string) => updateSchedule(uid, id, { noteId: null, item: null })

const timeFmt = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })
const yearFmt = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' })

/** 오늘 오후 3:00 / 내일 오전 9:00 / 10. 30. (목) 오후 3:00 */
export function formatWhen(ms: number): string {
  const d = new Date(ms)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.floor((new Date(ms).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000)
  const day =
    days === 0
      ? '오늘'
      : days === 1
        ? '내일'
        : days === -1
          ? '어제'
          : d.getFullYear() === today.getFullYear()
            ? dayFmt.format(d)
            : yearFmt.format(d)
  return `${day} ${timeFmt.format(d)}`
}

/** <input type="datetime-local">의 값 (현지 시각) */
export function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

/** 새 일정의 기본 시각: 다음 정각 */
export function nextHour(): number {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return d.getTime()
}
