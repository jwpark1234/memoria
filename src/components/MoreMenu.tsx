import { useEffect, useRef, useState } from 'react'
import { signOut } from '../lib/auth'
import { setTheme, useTheme, type Theme } from '../lib/theme'
import { Icon } from './Icon'

const THEME_LABEL: Record<Theme, string> = { system: '자동', light: '라이트', dark: '다크' }

// PWA 우상단 … 메뉴: 화면 테마와 로그아웃
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
              {(Object.keys(THEME_LABEL) as Theme[]).map((t) => (
                <button key={t} className={t === theme ? 'on' : ''} onClick={() => setTheme(t)}>
                  {THEME_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
          <button className="menu-item danger" role="menuitem" onClick={signOut}>
            로그아웃
          </button>
        </div>
      )}
    </div>
  )
}
