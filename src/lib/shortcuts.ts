import { inTauri } from './firebase'

// PC 단축키. 한 손(왼손)으로 누르게 키보드 왼쪽 윗줄에 모았다: 일정 Ctrl+Q · 할일 Ctrl+W · 메모 Ctrl+E. 검색은 Ctrl+F.
// Esc는 미니모드 (App.tsx). 각 + 등록 줄에 안내를 붙인다 (휴대폰은 키보드 단축키가 없어서 안내하지 않는다).
// 맥은 ⌘Q(종료)·⌘W(창 닫기)와 겹치지 않게 ⌘ 대신 Control(⌃) 키를 쓴다.

export const SHORTCUT = { schedule: 'Q', todo: 'W', note: 'E', search: 'F' } as const
export type ShortcutTarget = keyof typeof SHORTCUT

const mac = /Mac|iPhone|iPad/.test(navigator.platform)

/** "Ctrl+Q" / "⌃Q". 안내하지 않는 곳(휴대폰)은 빈 글자 */
export const shortcutLabel = (target: ShortcutTarget) =>
  inTauri ? (mac ? `⌃${SHORTCUT[target]}` : `Ctrl+${SHORTCUT[target]}`) : ''

/** 이 키 입력이 어느 단축키인지 (Ctrl만, 맥도 Control만 누른 경우) */
export function shortcutOf(e: KeyboardEvent): ShortcutTarget | null {
  if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null
  const key = e.key.toUpperCase()
  return (Object.keys(SHORTCUT) as ShortcutTarget[]).find((t) => SHORTCUT[t] === key) ?? null
}

/** 할일 등록 칸에 포커스를 준다 (Ctrl+W) */
export const TODO_INPUT_ID = 'todo-add-input'
