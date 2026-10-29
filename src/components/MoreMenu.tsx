import { useEffect, useRef, useState } from 'react'
import { askNotifyPermission } from '../lib/alarms'
import { signOut } from '../lib/auth'
import { auth } from '../lib/firebase'
import { pushSupported, registerPush } from '../lib/push'
import { setTheme, THEME_LABEL, THEMES, useTheme } from '../lib/theme'
import { FontSizePicker } from './FontSizePicker'
import { Icon } from './Icon'
import { LockSettings, useLockLabel } from './LockForm'

// PWA 우상단 톱니바퀴 설정 메뉴 (PC의 설정 패널과 같은 자리): 화면 테마, 글자 크기, 잠금 암호, 일정 알림, 로그아웃, 버전
export function MoreMenu() {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const uid = auth.currentUser?.uid ?? ''
  const lockLabel = useLockLabel(uid)
  // 잠금 암호 창은 메뉴를 닫고 띄운다 (메뉴 밖을 누르면 메뉴가 닫히므로)
  const [lockSettings, setLockSettings] = useState(false)
  // 일정 푸시: 알림을 아직 허용하지 않았으면 켜는 메뉴를 보여준다
  const [canPush, setCanPush] = useState(false)
  const [pushOn, setPushOn] = useState(typeof Notification !== 'undefined' && Notification.permission === 'granted')
  useEffect(() => {
    pushSupported().then(setCanPush, () => {})
  }, [])

  const enablePush = async () => {
    await askNotifyPermission()
    setPushOn(Notification.permission === 'granted')
    const uid = auth.currentUser?.uid
    if (uid) await registerPush(uid).catch((e) => console.error('[push]', e))
  }

  // 메뉴 밖을 누르면 닫는다
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  return (
    <div className="menu-wrap" ref={ref}>
      <button className={`icon-btn${open ? ' active' : ''}`} onClick={() => setOpen(!open)} title="설정">
        <Icon name="gear" />
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
          <div className="menu-row">
            <span>글자</span>
            <FontSizePicker />
          </div>
          {uid && lockLabel && (
            <div className="menu-row">
              <span>잠금 암호</span>
              <button
                className="text-btn"
                onClick={() => {
                  setOpen(false)
                  setLockSettings(true)
                }}
              >
                {lockLabel}
              </button>
            </div>
          )}
          {canPush && (
            <button className="menu-item" role="menuitem" onClick={enablePush} disabled={pushOn}>
              {pushOn
                ? '일정 알림 켜짐'
                : Notification.permission === 'denied'
                  ? '알림이 차단됨 · 설정에서 허용하세요'
                  : '일정 알림 켜기'}
            </button>
          )}
          <button className="menu-item danger" role="menuitem" onClick={signOut}>
            로그아웃
          </button>
          <div className="menu-row version">Memoria v{__APP_VERSION__}</div>
        </div>
      )}
      {lockSettings && <LockSettings uid={uid} onClose={() => setLockSettings(false)} />}
    </div>
  )
}
