import type { ReactNode } from 'react'

export type SyncStatus = 'synced' | 'typing' | 'syncing' | 'offline'

const STATUS_LABEL: Record<SyncStatus, string> = {
  synced: '동기화됨',
  typing: '입력 중',
  syncing: '업로드 중…',
  offline: '오프라인 · 연결되면 자동 업로드',
}

export function StatusBar({ status, children }: { status: SyncStatus; children?: ReactNode }) {
  return (
    <footer className="statusbar">
      <span className="status" role="status">
        <span className={`dot ${status}`} />
        {STATUS_LABEL[status]}
      </span>
      {children}
    </footer>
  )
}
