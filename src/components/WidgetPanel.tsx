import { CORNERS, MIN_OPACITY, setWidget, useWidget, type Corner } from '../lib/widget'

const CORNER_LABEL: Record<Corner, string> = {
  'top-left': '좌상단',
  'top-right': '우상단',
  'bottom-left': '좌하단',
  'bottom-right': '우하단',
}

/** 타이틀바 아래로 펼쳐지는 데스크톱 위젯 설정 */
export function WidgetPanel() {
  const w = useWidget()

  return (
    <div className="widget-panel">
      <label className="row">
        <span className="label">투명도</span>
        <input
          type="range"
          min={MIN_OPACITY}
          max={1}
          step={0.05}
          value={w.opacity}
          onChange={(e) => setWidget({ opacity: Number(e.target.value) })}
        />
        <span className="value">{Math.round(w.opacity * 100)}%</span>
      </label>

      <div className="row">
        <span className="label">위치</span>
        <div className="segment">
          <button className={w.fixed ? '' : 'on'} onClick={() => setWidget({ fixed: false })}>
            자유
          </button>
          <button className={w.fixed ? 'on' : ''} onClick={() => setWidget({ fixed: true })}>
            고정
          </button>
        </div>
        {w.fixed && (
          <div className="corners" role="group" aria-label="고정 위치">
            {CORNERS.map((c) => (
              <button
                key={c}
                className={c === w.corner ? 'on' : ''}
                onClick={() => setWidget({ corner: c })}
                title={CORNER_LABEL[c]}
                aria-label={CORNER_LABEL[c]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
