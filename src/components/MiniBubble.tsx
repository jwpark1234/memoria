import { mainWindow, setWidget, useWidget } from '../lib/widget'
import { Icon } from './Icon'

/**
 * 미니모드: 창(60px) 전체가 원형 아이콘 하나가 된다. 끌어서 옮기고, 마우스를 올리면 오른쪽 위에 펼치기 버튼이 나온다.
 * 크기와 생김새는 옆에 같이 띄워 쓰는 Claude Widget의 미니모드에 맞췄다.
 */
export function MiniBubble() {
  const { mini, fixed } = useWidget()
  if (!mini || !mainWindow) return null
  const drag = fixed ? {} : { 'data-tauri-drag-region': true }

  return (
    <div className="mini-bubble">
      <svg viewBox="0 0 60 60" aria-hidden>
        <circle cx="30" cy="30" r="27" className="mini-circle" />
        <rect x="19" y="20" width="22" height="3.5" rx="1.75" />
        <rect x="19" y="28" width="22" height="3.5" rx="1.75" opacity=".7" />
        <rect x="19" y="36" width="14" height="3.5" rx="1.75" opacity=".7" />
      </svg>
      {/* 드래그 영역은 원 위에 겹친 투명 판이다 (SVG 도형에는 data-tauri-drag-region이 먹지 않는다) */}
      <div className="mini-drag" {...drag} />
      <button className="mini-expand" onClick={() => setWidget({ mini: false })} title="펼치기">
        <Icon name="expand" size={10} />
      </button>
    </div>
  )
}
