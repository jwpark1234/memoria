// 메모는 일반 텍스트 그대로 저장하고, 링크만 색으로 표시한다.
// (체크리스트는 할일 목록으로 옮겼다. 예전에 "- [ ] "로 적은 줄은 목록 제목에서만 ☐/☑로 보인다)

const CHECK = /^(\s*)- \[([ xX])\] /
// 끝의 문장부호·닫는 괄호는 링크에 넣지 않는다
export const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"']*[^\s<>"'.,;:!?)\]}]/g

/** 링크 주소. www.로 시작하면 https://를 붙인다. */
const linkHref = (url: string) => (/^www\./i.test(url) ? `https://${url}` : url)

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

// 목록 제목 등 한 줄짜리 글자로 보여줄 때
export function plain(line: string): string {
  return line.replace(CHECK, (_, sp: string, c: string) => `${sp}${c === ' ' ? '☐' : '☑'} `)
}
