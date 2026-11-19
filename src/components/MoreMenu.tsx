import { useEffect, useState, type ReactNode } from 'react'
import { askNotifyPermission } from '../lib/alarms'
import { signOut } from '../lib/auth'
import { useAutostart } from '../lib/autostart'
import { busEnabled, useBusFavorites } from '../lib/bus'
import { auth } from '../lib/firebase'
import { FONT_SIZE_LABEL, FONT_SIZES, setFontSize, useFontSize } from '../lib/fontSize'
import { useOverlayClose } from '../lib/overlay'
import { pushSupported, registerPush } from '../lib/push'
import { setTheme, THEME_LABEL, THEMES, useTheme } from '../lib/theme'
import { CORNERS, mainWindow, MIN_OPACITY, setWidget, useWidget, type Corner } from '../lib/widget'
import { BusSheet } from './Bus'
import { Icon } from './Icon'
import { LockSettings, useLockLabel } from './LockForm'

const CORNER_LABEL: Record<Corner, string> = {
  'top-left': '좌상단',
  'top-right': '우상단',
  'bottom-left': '좌하단',
  'bottom-right': '우하단',
}

// ── 설정 줄: 모든 줄이 같은 틀이다. 왼쪽에 이름, 오른쪽에 조작(고르기 버튼 · 슬라이더+값 · 값과 화살표) ──

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="set-group">
      {title && <h4 className="set-head">{title}</h4>}
      <div className="set-card">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <span className="set-label">{label}</span>
      <span className="set-control">{children}</span>
    </div>
  )
}

/** 고르기: 자동|라이트|다크, 켬|끔 처럼 */
function Choice<T extends string | boolean>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; title?: string }[]
  value: T | undefined
  onChange: (v: T) => void
}) {
  return (
    <div className="segment">
      {options.map((o) => (
        <button key={String(o.value)} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} title={o.title}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface SliderProps {
  value: number
  min: number
  max: number
  step: number
  label: string // 오른쪽에 보일 지금 값
  onChange: (v: number) => void
}

/** 슬라이더와 오른쪽 값 */
function Slider({ value, min, max, step, label, onChange }: SliderProps) {
  return (
    <>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={label}
      />
      <span className="set-value">{label}</span>
    </>
  )
}

interface LinkProps {
  label: string
  value?: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

/** 눌러서 다른 창을 열거나 바로 실행하는 줄: 이름 · 지금 값 · › */
function LinkRow({ label, value, onClick, danger, disabled }: LinkProps) {
  return (
    <button className={`set-row set-link${danger ? ' danger' : ''}`} onClick={onClick} disabled={disabled}>
      <span className="set-label">{label}</span>
      <span className="set-control">
        {value && <span className="set-value">{value}</span>}
        {!danger && !disabled && <Icon name="forward" size={14} />}
      </span>
    </button>
  )
}

// 우상단 톱니바퀴 설정. 휴대폰·PC 모두 버스 즐겨찾기처럼 아래에서 올라오는 시트. 비슷한 것끼리 묶는다:
// 보기(화면, 글자 크기, PC 투명도) | 창(PC: 위치, 자동 실행) | 기능(버스 즐겨찾기, 휴대폰 일정 알림, 잠금 암호) | 계정(로그아웃)
export function MoreMenu() {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const uid = auth.currentUser?.uid ?? ''
  const lockLabel = useLockLabel(uid)
  // 잠금 암호 창·버스 즐겨찾기 시트는 설정을 닫고 띄운다
  const [lockSettings, setLockSettings] = useState(false)
  const [busSheet, setBusSheet] = useState(false)
  // 일정 푸시: 알림을 아직 허용하지 않았으면 켜는 줄을 보여준다
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

  const openOther = (show: () => void) => () => {
    setOpen(false)
    show()
  }
  const pushDenied = typeof Notification !== 'undefined' && Notification.permission === 'denied'

  const rows = (
    <>
      <Group title="보기">
        <Row label="화면">
          <Choice options={THEMES.map((t) => ({ value: t, label: THEME_LABEL[t] }))} value={theme} onChange={setTheme} />
        </Row>
        <FontSizeRow />
        {mainWindow && <OpacityRow />}
      </Group>
      {mainWindow && (
        <Group title="창">
          <DesktopRows />
        </Group>
      )}
      {uid && (
        <Group title="기능">
          {busEnabled && <BusRow uid={uid} onOpen={openOther(() => setBusSheet(true))} />}
          {canPush && (
            <LinkRow
              label="일정 알림"
              value={pushOn ? '켜짐' : pushDenied ? '차단됨 · 기기 설정에서 허용' : '켜기'}
              onClick={enablePush}
              disabled={pushOn || pushDenied}
            />
          )}
          {lockLabel && <LinkRow label="잠금 암호" value={lockLabel} onClick={openOther(() => setLockSettings(true))} />}
        </Group>
      )}
      <Group title="계정">
        <LinkRow label="로그아웃" onClick={signOut} danger />
      </Group>
      <p className="set-version">Memoria v{__APP_VERSION__}</p>
    </>
  )

  return (
    <div className="menu-wrap">
      <button className={`icon-btn${open ? ' active' : ''}`} onClick={() => setOpen(!open)} title="설정">
        <Icon name="gear" />
      </button>
      {open && <SettingsSheet onClose={() => setOpen(false)}>{rows}</SettingsSheet>}
      {lockSettings && <LockSettings uid={uid} onClose={() => setLockSettings(false)} />}
      {busSheet && <BusSettings uid={uid} onClose={() => setBusSheet(false)} />}
    </div>
  )
}

/** 설정 시트: 버스 즐겨찾기처럼 아래에서 올라온다 */
function SettingsSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const overlay = useOverlayClose(onClose)
  return (
    <div className="overlay sheet-overlay" {...overlay}>
      <div className="sheet settings-sheet" role="dialog" aria-modal aria-label="설정" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <span />
          <div className="sheet-title">
            <strong>설정</strong>
          </div>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body settings-list">{children}</div>
      </div>
    </div>
  )
}

/** 글자 크기: 5칸 슬라이더 */
function FontSizeRow() {
  const size = useFontSize()
  return (
    <Row label="글자 크기">
      <Slider
        value={FONT_SIZES.indexOf(size)}
        min={0}
        max={FONT_SIZES.length - 1}
        step={1}
        label={FONT_SIZE_LABEL[size]}
        onChange={(i) => setFontSize(FONT_SIZES[i])}
      />
    </Row>
  )
}

/** PC 위젯 창의 투명도 */
function OpacityRow() {
  const w = useWidget()
  return (
    <Row label="투명도">
      <Slider
        value={w.opacity}
        min={MIN_OPACITY}
        max={1}
        step={0.05}
        label={`${Math.round(w.opacity * 100)}%`}
        onChange={(opacity) => setWidget({ opacity })}
      />
    </Row>
  )
}

/** 버스 즐겨찾기: 몇 개인지 보이고, 누르면 편집 시트를 연다 */
function BusRow({ uid, onOpen }: { uid: string; onOpen: () => void }) {
  const favorites = useBusFavorites(uid)
  return <LinkRow label="버스 즐겨찾기" value={favorites.length ? `${favorites.length}개` : '추가'} onClick={onOpen} />
}

function BusSettings({ uid, onClose }: { uid: string; onClose: () => void }) {
  const favorites = useBusFavorites(uid)
  return <BusSheet uid={uid} favorites={favorites} onClose={onClose} />
}

/** PC 위젯 창의 위치와 자동 실행 */
function DesktopRows() {
  const w = useWidget()
  const [autostart, setAutostart] = useAutostart()
  return (
    <>
      <Row label="위치">
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
        <Choice
          options={[
            { value: false, label: '자유' },
            { value: true, label: '고정' },
          ]}
          value={w.fixed}
          onChange={(fixed) => setWidget({ fixed })}
        />
      </Row>
      <Row label="자동 실행">
        <Choice
          options={[
            { value: true, label: '켬', title: 'PC를 켜면 위젯을 띄운다' },
            { value: false, label: '끔' },
          ]}
          value={autostart}
          onChange={setAutostart}
        />
      </Row>
    </>
  )
}
