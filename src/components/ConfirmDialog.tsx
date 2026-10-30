import { useOverlayClose } from '../lib/overlay'

interface Props {
  message: string
  detail?: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  cancelLabel?: string
  // 세 갈래로 물을 때 가운데 버튼 (예: 메모만 삭제 / 일정도 삭제)
  altLabel?: string
  onAlt?: () => void
}

// window.confirm은 일부 WebView(Tauri)에서 동작하지 않아서 직접 그린다.
export function ConfirmDialog({ message, detail, confirmLabel, onConfirm, onCancel, cancelLabel = '취소', altLabel, onAlt }: Props) {
  const overlay = useOverlayClose(onCancel)
  return (
    <div className="overlay" {...overlay}>
      <div className="dialog" role="alertdialog" aria-modal aria-label={message} onClick={(e) => e.stopPropagation()}>
        <p>{message}</p>
        {detail && <p className="detail">{detail}</p>}
        <div className={`dialog-actions${altLabel ? ' stack' : ''}`}>
          {/* 실수로 Enter를 눌러도 지워지지 않게 취소에 초점을 둔다 */}
          <button autoFocus onClick={onCancel}>
            {cancelLabel}
          </button>
          {altLabel && <button onClick={onAlt}>{altLabel}</button>}
          <button className="danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
