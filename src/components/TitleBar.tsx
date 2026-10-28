import { useState, type ReactNode } from 'react'
import { applyUpdate, useUpdate } from '../lib/update'
import { setWidget, useWidget, win as tauriWindow } from '../lib/widget'
import { Icon } from './Icon'
import { WidgetPanel } from './WidgetPanel'

export function TitleBar({ children }: { children?: ReactNode }) {
  const win = tauriWindow
  const { onTop, fixed } = useWidget()
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
            <button
              className={`icon-btn${onTop ? ' active' : ''}`}
              onClick={() => setWidget({ onTop: !onTop })}
              title="항상 위에 표시"
            >
              <Icon name="pin" />
            </button>
            <button className={`icon-btn${panel ? ' active' : ''}`} onClick={() => setPanel(!panel)} title="위젯 설정">
              <Icon name="sliders" />
            </button>
            <button className="icon-btn" onClick={() => win.minimize()} title="최소화">
              <Icon name="minus" />
            </button>
            <button className="icon-btn" onClick={() => win.close()} title="트레이로 숨기기">
              <Icon name="close" />
            </button>
          </>
        )}
      </header>
      {panel && <WidgetPanel />}
    </>
  )
}
