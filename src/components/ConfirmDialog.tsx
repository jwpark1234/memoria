interface Props {
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

// window.confirm은 일부 WebView(Tauri)에서 동작하지 않아서 직접 그린다.
export function ConfirmDialog({ message, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <div className="overlay" onClick={onCancel} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className="dialog" role="alertdialog" aria-modal aria-label={message} onClick={(e) => e.stopPropagation()}>
        <p>{message}</p>
        <div className="dialog-actions">
          {/* 실수로 Enter를 눌러도 지워지지 않게 취소에 초점을 둔다 */}
          <button autoFocus onClick={onCancel}>
            취소
          </button>
          <button className="danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
