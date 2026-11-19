import type { ReactNode } from 'react'
import { LINK } from '../lib/markup'

// 링크는 글자 폭을 바꾸지 않게 색과 밑줄로만 표시한다 (편집기에서 textarea와 위치가 맞아야 한다)
export function MarkupText({ text }: { text: string }) {
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
