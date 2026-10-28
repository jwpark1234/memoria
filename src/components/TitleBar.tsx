import { useState, type ReactNode } from 'react'
import { applyUpdate, useUpdate } from '../lib/update'
import { mainWindow, setWidget, useWidget } from '../lib/widget'
import { Icon } from './Icon'
import { WidgetPanel } from './WidgetPanel'

export function TitleBar({ children }: { children?: ReactNode }) {
  const win = mainWindow
  const { fixed } = useWidget()
  const update = useUpdate()
  const [panel, setPanel] = useState(false)
  // 위치 고정 중에는 끌어서 옮길 수 없다
  const drag = win && !fixed ? { 'data-tauri-drag-region': true } : {}

  return (
    <>
      <header className="titlebar" {...drag}>
        <span className="title" {...drag}>
          Memoria
        </span>
        {update.available && (
          <button
            className={`icon-btn update${update.installing ? ' busy' : ''}`}
            onClick={applyUpdate}
            disabled={update.installing}
            title={update.installing ? '업데이트 중…' : `새 버전${update.version && ` v${update.version}`} 설치 후 다시 시작`}
          >
            <Icon name="update" />
          </button>
        )}
        <span className="grow" {...drag} />
        {children}
        {win && (
          <>
            <button className={`icon-btn${panel ? ' active' : ''}`} onClick={() => setPanel(!panel)} title="설정">
              <Icon name="gear" />
            </button>
            {/* 숨기기·종료는 트레이 아이콘에서 한다 */}
            <button className="icon-btn" onClick={() => setWidget({ mini: true })} title="미니모드">
              <Icon name="shrink" />
            </button>
          </>
        )}
      </header>
      {panel && <WidgetPanel />}
    </>
  )
}
