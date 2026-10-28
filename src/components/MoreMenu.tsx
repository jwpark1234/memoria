import { useEffect, useRef, useState } from 'react'
import { signOut } from '../lib/auth'
import { setTheme, THEME_LABEL, THEMES, useTheme } from '../lib/theme'
import { Icon } from './Icon'

// PWA 우상단 … 메뉴: 화면 테마, 로그아웃, 버전
export function MoreMenu() {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 메뉴 밖을 누르면 닫는다
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  return (
    <div className="menu-wrap" ref={ref}>
      <button className={`icon-btn${open ? ' active' : ''}`} onClick={() => setOpen(!open)} title="더보기">
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-row">
            <span>화면</span>
            <div className="segment">
              {THEMES.map((t) => (
                <button key={t} className={t === theme ? 'on' : ''} onClick={() => setTheme(t)}>
                  {THEME_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
          <button className="menu-item danger" role="menuitem" onClick={signOut}>
            로그아웃
          </button>
          <div className="menu-row version">Memoria v{__APP_VERSION__}</div>
        </div>
      )}
    </div>
  )
}
