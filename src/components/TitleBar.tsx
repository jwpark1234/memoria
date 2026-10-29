import { useRef, useState, type ReactNode } from 'react'
import { playChiptune, type Song } from '../lib/chiptune'
import { applyUpdate, useUpdate } from '../lib/update'
import { mainWindow, setWidget } from '../lib/widget'
import { EasterEgg } from './EasterEgg'
import { Icon } from './Icon'
import { WidgetPanel } from './WidgetPanel'

export function TitleBar({ children }: { children?: ReactNode }) {
  const win = mainWindow
  const update = useUpdate()
  const [panel, setPanel] = useState(false)
  const [egg, setEgg] = useState<Song | null>(null)
  // 제목을 빠르게 다섯 번 누르면 이스터에그 (EasterEgg.tsx)
  const taps = useRef<number[]>([])
  const tapTitle = () => {
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < 2000), now]
    if (taps.current.length < 5) return
    taps.current = []
    egg?.stop()
    // 소리는 누름 처리 안에서 바로 켜야 휴대폰에서도 난다
    setEgg(playChiptune() ?? { duration: 6, stop: () => {} })
  }
  return (
    <>
      {/* 창 끌기는 lib/widget.ts가 창 전체에서 처리한다 */}
      <header className="titlebar">
        <span className="title" onClick={tapTitle}>
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
      {egg && (
        <EasterEgg
          duration={egg.duration}
          onEnd={() => {
            egg.stop()
            setEgg(null)
          }}
        />
      )}
    </>
  )
}
