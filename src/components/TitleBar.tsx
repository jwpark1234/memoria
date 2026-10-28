import { useState, type ReactNode } from 'react'
import { applyUpdate, useUpdate } from '../lib/update'
import { mainWindow, setWidget } from '../lib/widget'
import { Icon } from './Icon'
import { WidgetPanel } from './WidgetPanel'

export function TitleBar({ children }: { children?: ReactNode }) {
  const win = mainWindow
  const update = useUpdate()
  const [panel, setPanel] = useState(false)
  return (
    <>
      {/* 창 끌기는 lib/widget.ts가 창 전체에서 처리한다 */}
      <header className="titlebar">
        <span className="title">
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
        <span className="grow" />
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
