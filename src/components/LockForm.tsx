import { useState, type ReactNode } from 'react'
import { useOverlayClose } from '../lib/overlay'
import { changeLock, setupLock, unlock, useLockMeta, useUnlocked, type LockMeta } from '../lib/lock'
import { Icon } from './Icon'

const MIN_LENGTH = 6

function Overlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const overlay = useOverlayClose(onClose)
  return (
    <div className="overlay" {...overlay}>
      <div className="dialog" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

interface PromptProps {
  meta: LockMeta
  message: string
  detail?: string
  confirmLabel: string
  onDone: () => void
  onCancel?: () => void
}

/** 잠금 암호를 묻고 맞으면 잠금을 푼다 (메모를 열 때, 잠글 때, 잠금을 풀 때) */
function PassForm({ meta, message, detail, confirmLabel, onDone, onCancel }: PromptProps) {
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy || !pass) return
    setBusy(true)
    setError('')
    // 암호에서 키를 만드는 데 일부러 시간이 걸린다 (짐작해서 맞히기 어렵게)
    const ok = await unlock(meta, pass)
    setBusy(false)
    if (ok) return onDone()
    setError('암호가 맞지 않습니다')
    setPass('')
  }

  return (
    <form
      className="lock-form"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Icon name="lock" size={28} />
      <p>{message}</p>
      {detail && <p className="detail">{detail}</p>}
      <input
        type="password"
        autoFocus
        autoComplete="current-password"
        placeholder="잠금 암호"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      <div className="dialog-actions">
        {onCancel && (
          <button type="button" onClick={onCancel}>
            취소
          </button>
        )}
        <button type="submit" className="ok" disabled={busy || !pass}>
          {busy ? '확인 중…' : confirmLabel}
        </button>
      </div>
    </form>
  )
}

/** 편집기에서 잠그거나 잠금을 풀기 전에 암호를 묻는 창. 암호를 아직 정하지 않았으면 설정으로 안내한다. */
export function PassPrompt({ uid, ...props }: Omit<PromptProps, 'meta'> & { uid: string; onCancel: () => void }) {
  const meta = useLockMeta(uid)
  return (
    <Overlay onClose={props.onCancel}>
      {meta === null ? (
        <div className="lock-form">
          <Icon name="lock" size={28} />
          <p>잠금 암호가 없습니다</p>
          <p className="detail">설정에서 잠금 암호를 먼저 정하세요.</p>
          <div className="dialog-actions">
            <button type="button" onClick={props.onCancel}>
              닫기
            </button>
          </div>
        </div>
      ) : (
        meta && <PassForm meta={meta} {...props} />
      )}
    </Overlay>
  )
}

/** 잠긴 메모를 열었을 때: 암호를 넣으면 풀려서 편집기로 바뀐다 */
export function LockedNote({
  uid,
  title,
  onBack,
  standalone,
}: {
  uid: string
  title: string
  onBack: () => void
  standalone?: boolean
}) {
  const meta = useLockMeta(uid)
  const unlocked = useUnlocked()
  return (
    <div className="editor">
      <div className="editor-bar">
        {!standalone && (
          <button className="icon-btn" onClick={onBack} title="목록으로">
            <Icon name="back" />
          </button>
        )}
        <span className={`note-title${title ? '' : ' placeholder'}`}>{title || '잠긴 메모'}</span>
        {standalone && (
          <button className="icon-btn" onClick={onBack} title="닫기">
            <Icon name="close" />
          </button>
        )}
      </div>
      <div className="locked-body">
        {unlocked ? (
          <p className="detail">여는 중…</p>
        ) : meta === undefined ? null : meta === null ? (
          <p className="detail">잠금 암호 정보를 찾을 수 없습니다.</p>
        ) : (
          <PassForm meta={meta} message="잠긴 메모" confirmLabel="열기" onDone={() => {}} />
        )}
      </div>
    </div>
  )
}

/** 설정: 잠금 암호 정하기·바꾸기 */
export function LockSettings({ uid, onClose }: { uid: string; onClose: () => void }) {
  const meta = useLockMeta(uid)
  const [current, setCurrent] = useState('')
  const [pass, setPass] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (meta === undefined) return null
  const creating = meta === null

  const submit = async () => {
    if (busy) return
    if (pass.length < MIN_LENGTH) return setError(`새 암호는 ${MIN_LENGTH}자 이상으로 정하세요`)
    if (pass !== again) return setError('새 암호를 두 번 다르게 입력했습니다')
    setBusy(true)
    setError('')
    const ok = creating ? (await setupLock(uid, pass), true) : await changeLock(uid, meta, current, pass)
    setBusy(false)
    if (ok) onClose()
    else setError('지금 암호가 맞지 않습니다')
  }

  return (
    <Overlay onClose={onClose}>
      <form
        className="lock-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Icon name="lock" size={28} />
        <p>{creating ? '잠금 암호 정하기' : '잠금 암호 바꾸기'}</p>
        <p className="detail">
          잠금 메모를 열고, 잠그고, 풀 때 묻습니다.
          <br />
          암호는 어디에도 저장하지 않습니다.
          <br />
          <strong>잊으면 잠긴 메모를 되살릴 수 없습니다.</strong>
        </p>
        {!creating && (
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="지금 암호"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        )}
        <input
          type="password"
          autoFocus={creating}
          autoComplete="new-password"
          placeholder="새 암호"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="새 암호 확인"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="ok" disabled={busy || !pass || (!creating && !current)}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </Overlay>
  )
}

/** 설정 화면의 "잠금 암호" 버튼 글자 */
export function useLockLabel(uid: string) {
  const meta = useLockMeta(uid)
  return meta === undefined ? '' : meta ? '바꾸기' : '정하기'
}
