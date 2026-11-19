import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from './firebase'
import type { Note } from './notes'

// 할일 = 작업 대장. 받은 일(text)에 받은 날(createdAt)과 완료한 날(doneAt)을 같이 둬서 "언제 받아 언제 끝냈는지" 남긴다.
// 그룹(group)으로 묶는다 (예: 와플, 집 일). 메모의 체크리스트를 대신한다.
export interface Todo {
  id: string
  text: string
  group: string // 그룹 이름. 빈 글자면 그룹 없음
  createdAt: number // 받은 시각 (ms)
  doneAt: number | null // 완료한 시각. null이면 진행 중
  legacy?: boolean // group 필드가 없는 예전 할일 ("그룹 · 내용"으로 옮겨 온 것). 화면이 한 번 나눠 저장한다
}

const todosCol = (uid: string) => collection(db, 'users', uid, 'todos')

// 쓰기는 await하지 않는다 (lib/notes.ts와 같은 방식)
const report = (e: unknown) => console.error('[todos]', e)

const ms = (t: unknown) => (t as Timestamp | null | undefined)?.toMillis() ?? null

export function useTodos(uid: string) {
  const [todos, setTodos] = useState<Todo[]>([])

  useEffect(() => {
    const q = query(todosCol(uid), where('deleted', '==', false))
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => {
          // 방금 쓴 시각은 서버 값이 오기 전까지 이 기기 시각으로 본다
          const data = d.data({ serverTimestamps: 'estimate' })
          return {
            id: d.id,
            text: data.text ?? '',
            group: typeof data.group === 'string' ? data.group : '',
            ...(typeof data.group !== 'string' && { legacy: true }),
            createdAt: ms(data.createdAt) ?? Date.now(),
            doneAt: data.done ? (ms(data.doneAt) ?? Date.now()) : null,
          } satisfies Todo
        })
        setTodos(list)
      },
      report,
    )
  }, [uid])

  return todos
}

/** 할 일은 기록한 순서대로, 끝낸 일은 최근에 끝낸 것부터 */
export function splitTodos(todos: Todo[]) {
  const open = todos.filter((t) => t.doneAt === null).sort((a, b) => a.createdAt - b.createdAt)
  const done = todos.filter((t) => t.doneAt !== null).sort((a, b) => b.doneAt! - a.doneAt!)
  return { open, done }
}

/** 그룹 이름들: 진행 중인 일이 있는 그룹부터, 오래 받은 일이 있는 그룹 순 */
export function todoGroups(todos: Todo[]) {
  const { open, done } = splitTodos(todos)
  const names: string[] = []
  for (const t of [...open, ...done]) if (t.group && !names.includes(t.group)) names.push(t.group)
  return names
}

export function createTodo(uid: string, text: string, group = '') {
  setDoc(doc(todosCol(uid)), {
    text,
    group,
    done: false,
    doneAt: null,
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }).catch(report)
}

/** 글자·그룹·받은 날·완료한 날을 고친다 (할일 창에서) */
export function updateTodo(
  uid: string,
  id: string,
  patch: { text?: string; group?: string; createdAt?: number; doneAt?: number },
) {
  const { text, group, createdAt, doneAt } = patch
  updateDoc(doc(todosCol(uid), id), {
    ...(text !== undefined && { text }),
    ...(group !== undefined && { group }),
    ...(createdAt !== undefined && { createdAt: Timestamp.fromMillis(createdAt) }),
    ...(doneAt !== undefined && { doneAt: Timestamp.fromMillis(doneAt) }),
    updatedAt: serverTimestamp(),
  }).catch(report)
}

/** 끝내면 완료한 날을 적고, 되돌리면 지운다 */
export function setTodoDone(uid: string, id: string, done: boolean) {
  updateDoc(doc(todosCol(uid), id), {
    done,
    doneAt: done ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  }).catch(report)
}

// 메모처럼 플래그만 세운다
export function deleteTodo(uid: string, id: string) {
  updateDoc(doc(todosCol(uid), id), { deleted: true, updatedAt: serverTimestamp() }).catch(report)
}

// ── 메모 속 체크리스트를 할일로 옮기기 (한 번만 쓰는 이관) ──────────────────────
// 예전 메모의 "- [ ] 항목" 줄을 할일로 만들고 메모에서는 그 줄(과 딸린 설명 줄)을 지운다. "- [x]"는 완료한 할일이 된다.
// 기록한 날은 메모를 만든 날, 완료한 날은 알 수 없어서 메모를 마지막으로 고친 날로 둔다.
// 잠금 메모는 본문이 암호화돼 있어 건너뛴다.

const CHECK = /^\s*- \[([ xX])\] ?(.*)$/

/**
 * 메모를 빈 줄로 나눈 묶음마다 체크리스트 항목을 뽑는다.
 * - 묶음 첫 줄이 항목이 아니면 그 묶음의 제목("BSSS", "AI+인증")으로 보고 할일 그룹으로 삼는다. 제목 없는 묶음은 메모 제목을 그룹으로.
 * - 항목 바로 아래 들여쓴 줄이나 "- "로 시작하는 줄은 그 항목의 설명으로 보고 괄호로 붙인다.
 * - "1. " 같은 앞 번호는 뗀다. 항목이 다 빠져 제목만 남은 묶음은 제목도 지운다.
 */
function splitChecklist(text: string, noteTitle = '') {
  const items: { text: string; group: string; done: boolean }[] = []
  const kept: string[][] = []
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split('\n')
    const first = lines[0]?.trim() ?? ''
    const heading = first && !CHECK.test(lines[0]) && !/^\s/.test(lines[0]) && lines.some((l) => CHECK.test(l)) ? first : ''
    const context = heading || noteTitle.trim()
    const rest: string[] = []
    let current: { text: string; done: boolean; details: string[] } | null = null
    const flush = () => {
      if (!current) return
      const name = current.text.replace(/^\d+\.\s*/, '')
      const detail = current.details.length ? ` (${current.details.join(', ')})` : ''
      items.push({ text: `${name}${detail}`, group: context, done: current.done })
      current = null
    }
    for (const line of lines) {
      const m = CHECK.exec(line)
      if (m) {
        flush()
        // 글자 없는 빈 항목은 그냥 지운다
        if (m[2].trim()) current = { text: m[2].trim(), done: m[1] !== ' ', details: [] }
      } else if (current && line.trim() && (/^\s/.test(line) || /^- /.test(line))) {
        current.details.push(line.trim().replace(/^- /, ''))
      } else {
        flush()
        rest.push(line)
      }
    }
    flush()
    // 제목만 남았으면 묶음째 지운다
    const left = rest.filter((l) => l.trim())
    if (left.length && !(heading && left.length === 1 && left[0].trim() === heading)) kept.push(rest)
  }
  return { items, rest: kept.map((b) => b.join('\n').trimEnd()).join('\n\n').trim() }
}

/** 옮길 체크리스트 항목 수 (잠금 메모 제외) */
export const checklistCount = (notes: Note[]) =>
  notes.reduce((n, note) => n + (note.locked ? 0 : splitChecklist(note.text, note.title).items.length), 0)

/** 옮긴 항목 수를 돌려준다. 메모마다 한 트랜잭션이라 두 기기에서 같이 눌러도 두 번 옮겨지지 않는다. */
export async function moveChecklists(uid: string, notes: Note[]): Promise<number> {
  const targets = notes.filter((n) => !n.locked && splitChecklist(n.text, n.title).items.length)
  // 되돌릴 수 있게 옮기기 전 본문을 남긴다 (users/{uid}/meta/checklist-backup)
  await setDoc(doc(db, 'users', uid, 'meta', 'checklist-backup'), {
    at: serverTimestamp(),
    notes: targets.map((n) => ({ id: n.id, title: n.title, text: n.text })),
  })
  let moved = 0
  for (const n of targets) {
    moved += await runTransaction(db, async (tx) => {
      const ref = doc(db, 'users', uid, 'notes', n.id)
      const data = (await tx.get(ref)).data()
      if (!data || data.deleted || data.locked) return 0
      const { items, rest } = splitChecklist(data.text ?? '', data.title ?? '')
      if (!items.length) return 0
      const updated = (data.updatedAt as Timestamp | null)?.toMillis() ?? Date.now()
      const created = (data.createdAt as Timestamp | null)?.toMillis() ?? updated
      // 같은 메모 안의 순서를 지키려고 1ms씩 늦춘다
      items.forEach((it, i) =>
        tx.set(doc(todosCol(uid)), {
          text: it.text,
          group: it.group,
          done: it.done,
          doneAt: it.done ? Timestamp.fromMillis(updated + i) : null,
          deleted: false,
          createdAt: Timestamp.fromMillis(created + i),
          updatedAt: serverTimestamp(),
        }),
      )
      // 메모 수정 시각은 그대로 둬서 목록 순서가 바뀌지 않게 한다
      tx.update(ref, { text: rest })
      return items.length
    })
  }
  return moved
}

/** 예전 할일("그룹 · 내용" 글자, group 필드 없음)을 그룹과 내용으로 나눠 저장한다. 한 번만 하면 된다. */
export function splitLegacyGroup(uid: string, t: Todo) {
  const m = /^(.+?) · (.+)$/s.exec(t.text)
  updateTodo(uid, t.id, m ? { group: m[1].trim(), text: m[2].trim() } : { group: '' })
}
