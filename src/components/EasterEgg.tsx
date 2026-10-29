import { useEffect, useRef } from 'react'

// 이스터에그: 제목 "Memoria"를 빠르게 다섯 번 누르면 음표가 떠오르고 8비트 곡이 흐른다.
// 곡은 lib/chiptune.ts가 그 자리에서 합성한다 (음원 파일 없음). 휴대폰은 누른 순간에만 소리를 켤 수 있어서
// 곡은 누름을 받은 TitleBar가 틀고, 여기서는 곡 길이만큼 화면 효과를 보여준다.

const NOTES = ['♪', '♫', '♩', '♬']

export function EasterEgg({ duration, onEnd }: { duration: number; onEnd: () => void }) {
  const end = useRef(onEnd)
  end.current = onEnd

  useEffect(() => {
    const timer = window.setTimeout(() => end.current(), duration * 1000)
    return () => window.clearTimeout(timer)
  }, [duration])

  return (
    <div className="easter" onClick={() => end.current()} aria-hidden>
      {Array.from({ length: 14 }, (_, i) => (
        <span
          key={i}
          className="easter-note"
          style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.35}s`, fontSize: `${16 + ((i * 7) % 14)}px` }}
        >
          {NOTES[i % NOTES.length]}
        </span>
      ))}
      <p className="easter-text">
        memoria
        <br />
        <small>memoria…</small>
      </p>
    </div>
  )
}
