/**
 * macOS 창 왼쪽 위의 신호등 버튼 (빨강 닫기 · 노랑 최소화 · 초록 확대).
 * 묶음에 마우스를 올리면 기호(× − +)가 보이고, 창이 포커스를 잃으면 회색이 된다 (styles.css .traffic).
 * 받지 않은 동작의 버튼은 macOS처럼 회색으로 꺼 둔다.
 */
export function TrafficLights({ onClose, onMinimize, onZoom }: { onClose?: () => void; onMinimize?: () => void; onZoom?: () => void }) {
  return (
    <div className="traffic">
      <Light kind="close" label="닫기" onClick={onClose} d="M3 3l6 6M9 3 3 9" />
      <Light kind="min" label="미니모드" onClick={onMinimize} d="M2.5 6h7" />
      <Light kind="zoom" label="확대" onClick={onZoom} d="M6 2.5v7M2.5 6h7" />
    </div>
  )
}

function Light({ kind, label, onClick, d }: { kind: string; label: string; onClick?: () => void; d: string }) {
  return (
    <button className={`tl ${kind}`} onClick={onClick} disabled={!onClick} title={onClick ? label : undefined} aria-label={label} tabIndex={-1}>
      <svg viewBox="0 0 12 12" aria-hidden>
        <path d={d} />
      </svg>
    </button>
  )
}
