import { useState } from 'react'
import { signOut } from '../lib/auth'
import { useAutostart } from '../lib/autostart'
import { auth } from '../lib/firebase'
import { setTheme, THEME_LABEL, THEMES, useTheme } from '../lib/theme'
import { FontSizePicker } from './FontSizePicker'
import { LockSettings, useLockLabel } from './LockForm'
import { CORNERS, MIN_OPACITY, setWidget, useWidget, type Corner } from '../lib/widget'

const CORNER_LABEL: Record<Corner, string> = {
  'top-left': '좌상단',
  'top-right': '우상단',
  'bottom-left': '좌하단',
  'bottom-right': '우하단',
}

/** 타이틀바 톱니바퀴 버튼으로 펼치는 데스크톱 설정 */
export function WidgetPanel() {
  const w = useWidget()
  const theme = useTheme()
  const [autostart, setAutostart] = useAutostart()
  const uid = auth.currentUser?.uid ?? ''
  const lockLabel = useLockLabel(uid)
  const [lockSettings, setLockSettings] = useState(false)

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
        <span className="label">화면</span>
        <div className="segment">
          {THEMES.map((t) => (
            <button key={t} className={t === theme ? 'on' : ''} onClick={() => setTheme(t)}>
              {THEME_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="row">
        <span className="label">글자</span>
        <FontSizePicker />
      </div>

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

      <div className="row">
        <span className="label">자동 실행</span>
        <div className="segment">
          <button className={autostart ? 'on' : ''} onClick={() => setAutostart(true)} title="PC를 켜면 위젯을 띄운다">
            켬
          </button>
          <button className={autostart === false ? 'on' : ''} onClick={() => setAutostart(false)}>
            끔
          </button>
        </div>
      </div>

      {uid && lockLabel && (
        <div className="row">
          <span className="label">잠금 암호</span>
          <button className="text-btn" onClick={() => setLockSettings(true)}>
            {lockLabel}
          </button>
          {lockSettings && <LockSettings uid={uid} onClose={() => setLockSettings(false)} />}
        </div>
      )}

      {auth.currentUser && (
        <div className="row">
          <span className="label">계정</span>
          <button className="text-btn danger" onClick={signOut} title={auth.currentUser.email ?? undefined}>
            로그아웃
          </button>
        </div>
      )}

      <div className="row">
        <span className="label">버전</span>
        <span className="version">v{__APP_VERSION__}</span>
      </div>
    </div>
  )
}
