import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// 흐르는 속도 (px/초)
const SPEED = 40
// 끝과 다음 처음 사이 간격 (px)
const GAP = 40
// 한 바퀴 돌고 처음 자리에서 멈추는 시간 (ms). 처음 뜰 때도 이만큼 보여 주고 흐른다.
const PAUSE = 2500

/**
 * 흐르는 글자 한 줄 (전광판). 내용이 짧아도 오른쪽 끝에서 들어와 왼쪽으로 빠져나간다.
 * 한 벌의 폭을 칸 폭 이상으로 잡아 두 벌을 이어 붙이고 한 벌만큼 옮긴다. 다 옮긴 자리는 처음과 똑같아 보여서,
 * 처음 자리로 되돌려 PAUSE만큼 멈췄다가 다시 흐른다. 마우스를 올리면 멈춘다.
 */
export function Marquee({ children, className = '' }: { children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLSpanElement>(null)
  const [size, setSize] = useState({ box: 0, content: 0 })
  const [resting, setResting] = useState(true)
  const timer = useRef<number | undefined>(undefined)

  useLayoutEffect(() => {
    const measure = () => {
      const b = box.current?.clientWidth ?? 0
      const c = content.current?.offsetWidth ?? 0
      setSize((s) => (s.box === b && s.content === c ? s : { box: b, content: c }))
    }
    const observer = new ResizeObserver(measure)
    if (box.current) observer.observe(box.current)
    if (content.current) observer.observe(content.current)
    measure()
    return () => observer.disconnect()
  }, [])

  const rest = () => {
    setResting(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setResting(false), PAUSE)
  }
  useEffect(() => {
    rest()
    return () => window.clearTimeout(timer.current)
  }, [])

  // 한 벌의 폭: 내용 + 간격, 칸보다 짧으면 칸 폭 (그래야 내용이 칸 오른쪽 끝에서 새로 들어온다)
  const item = Math.max(size.content + GAP, size.box)
  const ready = size.box > 0
  const moving = ready && !resting
  const one = (hidden: boolean) => (
    <span className="marquee-item" style={ready ? { width: item } : undefined} aria-hidden={hidden || undefined}>
      <span ref={hidden ? undefined : content}>{children}</span>
    </span>
  )
  return (
    <div className={`marquee ${className}`} ref={box}>
      <span
        className={`marquee-track${moving ? ' moving' : ''}`}
        style={moving ? { animationDuration: `${item / SPEED}s` } : undefined}
        onAnimationEnd={rest}
      >
        {one(false)}
        {one(true)}
      </span>
    </div>
  )
}
