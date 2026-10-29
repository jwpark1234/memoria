// 메모는 일반 텍스트 그대로 저장한다. 체크리스트는 "- [ ] "로 적고
// 편집기와 목록에서만 체크박스로 그려 보여준다. (다른 기기·검색에서는 글자 그대로)

export const CHECK = /^(\s*)- \[([ xX])\] /
// 끝의 문장부호·닫는 괄호는 링크에 넣지 않는다
export const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"']*[^\s<>"'.,;:!?)\]}]/g

/** 링크 주소. www.로 시작하면 https://를 붙인다. */
export const linkHref = (url: string) => (/^www\./i.test(url) ? `https://${url}` : url)

/** pos 자리에 있는 링크 */
export function linkAt(text: string, pos: number): string | null {
  const start = text.lastIndexOf('\n', pos - 1) + 1
  let end = text.indexOf('\n', pos)
  if (end < 0) end = text.length
  for (const m of text.slice(start, end).matchAll(LINK)) {
    if (start + m.index <= pos && pos <= start + m.index + m[0].length) return linkHref(m[0])
  }
  return null
}

export interface ChecklistItem {
  line: number // 몇째 줄인지 (0부터)
  text: string // 체크박스 뒤의 글자 (앞뒤 공백 제외)
  done: boolean
}

/** 한 줄이 체크리스트 항목이면 그 내용 */
export function checklistItem(line: string, index: number): ChecklistItem | null {
  const m = CHECK.exec(line)
  return m ? { line: index, text: line.slice(m[0].length).trim(), done: m[2] !== ' ' } : null
}

/** pos가 있는 줄 번호 */
export const lineIndexAt = (text: string, pos: number) => text.slice(0, pos).split('\n').length - 1

// 텍스트 한 구간을 바꾸는 편집. sel은 바꾼 뒤의 선택 영역이다.
export interface Edit {
  start: number
  end: number
  text: string
  sel: [number, number]
}

// at 위치에서 del 글자를 지우고 ins를 넣는다. 위치 순으로 정렬돼 있고 겹치지 않는다.
interface Op {
  at: number
  del: number
  ins: string
}

interface Line {
  start: number
  end: number
  text: string
}

// 선택 영역이 걸친 줄들. 다음 줄 맨 앞에서 끝난 선택은 그 줄을 포함하지 않는다.
function linesIn(text: string, start: number, end: number): Line[] {
  if (end > start && text[end - 1] === '\n') end--
  const lines: Line[] = []
  let at = text.lastIndexOf('\n', start - 1) + 1
  for (;;) {
    let e = text.indexOf('\n', at)
    if (e < 0) e = text.length
    lines.push({ start: at, end: e, text: text.slice(at, e) })
    if (e >= end || e === text.length) return lines
    at = e + 1
  }
}

// 편집 전 위치를 편집 후 위치로 옮긴다. after면 같은 자리에 넣은 글자 뒤로 간다.
function mapPos(ops: Op[], pos: number, after: boolean): number {
  let d = 0
  for (const op of ops) {
    if (op.at > pos || (op.at === pos && !op.del && !after)) break
    if (pos < op.at + op.del) return op.at + d + (after ? op.ins.length : 0)
    d += op.ins.length - op.del
  }
  return pos + d
}

function build(text: string, ops: Op[], sel: [number, number]): Edit | null {
  if (!ops.length) return null
  const start = ops[0].at
  const end = Math.max(...ops.map((op) => op.at + op.del))
  let out = ''
  let at = start
  for (const op of ops) {
    out += text.slice(at, op.at) + op.ins
    at = op.at + op.del
  }
  out += text.slice(at, end)
  return { start, end, text: out, sel }
}

// 고른 줄들을 체크리스트로 만든다. 이미 모두 체크리스트면 되돌린다.
export function toggleChecklist(text: string, start: number, end: number): Edit | null {
  const lines = linesIn(text, start, end)
  const filled = lines.filter((l) => l.text.trim())
  const remove = filled.length > 0 && filled.every((l) => CHECK.test(l.text))
  const ops: Op[] = []
  for (const l of lines) {
    if (remove) {
      const m = CHECK.exec(l.text)
      if (m) ops.push({ at: l.start + m[1].length, del: m[0].length - m[1].length, ins: '' })
    } else if (!CHECK.test(l.text) && (l.text.trim() || lines.length === 1)) {
      // "- 우유" 같은 목록은 기호를 체크박스로 바꾼다
      const m = /^(\s*)([-*] )?/.exec(l.text)!
      ops.push({ at: l.start + m[1].length, del: m[2]?.length ?? 0, ins: '- [ ] ' })
    }
  }
  const collapsed = start === end
  return build(text, ops, [mapPos(ops, start, collapsed), mapPos(ops, end, true)])
}

// 고른 줄들의 체크를 켜고 끈다. 하나라도 안 된 게 있으면 모두 켠다.
export function toggleDone(text: string, start: number, end: number): Edit | null {
  const items = linesIn(text, start, end).flatMap((l) => {
    const m = CHECK.exec(l.text)
    return m ? [{ at: l.start + m[1].length + 3, done: m[2] !== ' ' }] : []
  })
  const done = !items.every((i) => i.done)
  const ops = items.filter((i) => i.done !== done).map((i) => ({ at: i.at, del: 1, ins: done ? 'x' : ' ' }))
  return build(text, ops, [start, end])
}

// 클릭한 자리가 체크박스("[ ]")면 그 줄의 체크를 바꾼다.
export function clickCheck(text: string, pos: number): Edit | null {
  const l = linesIn(text, pos, pos)[0]
  const m = CHECK.exec(l.text)
  if (!m) return null
  const box = l.start + m[1].length + 2
  return pos >= box && pos <= box + 3 ? toggleDone(text, pos, pos) : null
}

// 체크리스트 줄에서 Enter: 다음 항목을 만든다. 빈 항목이면 체크리스트를 끝낸다.
export function continueChecklist(text: string, pos: number): Edit | null {
  const l = linesIn(text, pos, pos)[0]
  const m = CHECK.exec(l.text)
  if (!m || pos < l.start + m[0].length) return null
  if (!l.text.slice(m[0].length).trim()) {
    return { start: l.start + m[1].length, end: l.end, text: '', sel: [l.start + m[1].length, l.start + m[1].length] }
  }
  const ins = `\n${m[1]}- [ ] `
  return { start: pos, end: pos, text: ins, sel: [pos + ins.length, pos + ins.length] }
}

// 목록 제목 등 한 줄짜리 글자로 보여줄 때
export function plain(line: string): string {
  return line.replace(CHECK, (_, sp: string, c: string) => `${sp}${c === ' ' ? '☐' : '☑'} `)
}

/** 메모 제목: 따로 적은 제목이 없으면 내용의 첫 줄 */
export const noteTitle = (note: { title: string; text: string }) =>
  note.title.trim() || plain(note.text.trim().split('\n')[0])

// ── 체크리스트 항목에 걸린 일정 ─────────────────────────────────────────────
// 일정은 항목 글자로 메모 속 줄을 찾는다. 편집기는 입력할 때마다 줄 번호를 따라가서
// 항목 글자를 고쳐도, 위아래에 줄을 넣어도 같은 항목을 가리키게 한다.

/** 일정 id → 걸린 줄 번호. null이면 그 항목이 사라졌다. */
export type ItemLines = Map<string, number | null>

/** 아직 다른 일정이 차지하지 않은, 글자가 item인 첫 체크리스트 줄 */
export function findItemLine(lines: string[], item: string, taken: Set<number> = new Set()): number | null {
  for (let i = 0; i < lines.length; i++) {
    if (!taken.has(i) && checklistItem(lines[i], i)?.text === item) return i
  }
  return null
}

/** 메모 글자에서 일정들이 걸린 줄을 찾는다 */
export function locateItems(text: string, items: { id: string; item: string }[]): ItemLines {
  const lines = text.split('\n')
  const taken = new Set<number>()
  const out: ItemLines = new Map()
  for (const { id, item } of items) {
    const k = findItemLine(lines, item, taken)
    if (k !== null) taken.add(k)
    out.set(id, k)
  }
  return out
}

/** 편집 한 번(이어진 한 구간을 바꿈) 뒤의 줄 번호. 바뀐 구간 밖의 줄은 줄 수 차이만큼 밀린다. */
export function shiftItems(before: string, after: string, track: ItemLines): ItemLines {
  const a = before.split('\n')
  const b = after.split('\n')
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  let s = 0
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++
  const aEnd = a.length - s
  const bEnd = b.length - s
  const changed = b.slice(p, bEnd)

  const out: ItemLines = new Map()
  for (const [id, k] of track) {
    if (k === null || k < p) out.set(id, k)
    else if (k >= aEnd) out.set(id, k + b.length - a.length)
    else {
      // 바뀐 구간 안: 같은 자리의 줄이 아직 항목이면 그 항목을 고친 것으로 본다 (글자 입력, 체크, 줄 나누기).
      // 아니면 같은 글자의 항목을 구간 안에서 찾는다 (붙여넣기로 옮김).
      const j = k - p
      const old = checklistItem(a[k], k)
      const same = j < changed.length && checklistItem(changed[j], p + j)
      if (same && (aEnd - p === changed.length || j === 0 || same.text === old?.text)) out.set(id, p + j)
      else {
        const found = old && findItemLine(changed, old.text)
        out.set(id, found == null ? null : p + found)
      }
    }
  }
  return out
}

/** 글자가 item인 체크리스트 줄을 지운 글자 */
export function removeItem(text: string, item: string): string {
  const lines = text.split('\n')
  const k = findItemLine(lines, item)
  if (k === null) return text
  lines.splice(k, 1)
  return lines.join('\n')
}

/** 글자가 item인 체크리스트 줄의 체크를 바꾼 글자 */
export function setItemDone(text: string, item: string, done: boolean): string {
  const lines = text.split('\n')
  const k = findItemLine(lines, item)
  if (k === null) return text
  lines[k] = lines[k].replace(CHECK, (_, sp: string) => `${sp}- [${done ? 'x' : ' '}] `)
  return lines.join('\n')
}
