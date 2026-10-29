import { Fragment, type ReactNode } from 'react'
import { CHECK, LINK } from '../lib/markup'

// 링크는 글자 폭을 바꾸지 않게 색과 밑줄로만 표시한다 (편집기에서 textarea와 위치가 맞아야 한다)
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(LINK)) {
    out.push(
      text.slice(last, m.index),
      <span key={m.index} className="link">
        {m[0]}
      </span>,
    )
    last = m.index + m[0].length
  }
  out.push(text.slice(last))
  return out
}

function line(text: string, editor: boolean): ReactNode {
  const m = CHECK.exec(text)
  if (!m) return inline(text)
  const done = m[2] !== ' '
  return (
    <>
      {m[1]}
      {/* 편집기에서는 "- [ ]" 글자를 투명하게 두고 그 자리에 상자를 그린다 */}
      <span className={`box${done ? ' done' : ''}`}>{editor ? `- [${m[2]}]` : done ? '☑' : '☐'}</span>{' '}
      <span className={done ? 'done' : undefined}>{inline(text.slice(m[0].length))}</span>
    </>
  )
}

interface Props {
  text: string
  // 편집기 뒤에 겹쳐 그릴 때: 표기 글자를 지우지 않아 글자 위치가 textarea와 똑같다
  editor?: boolean
  // 일정이 걸린 줄 번호 → 줄 끝에 붙일 일정 시각
  alarms?: Map<number, string>
}

export function MarkupText({ text, editor = false, alarms }: Props) {
  return text.split('\n').map((l, i) => (
    <Fragment key={i}>
      {i > 0 && '\n'}
      {line(l, editor)}
      {alarms?.has(i) && <span className="alarm" data-label={alarms.get(i)} />}
    </Fragment>
  ))
}
