import { useEffect, useRef } from 'react'

// 이스터에그: 제목 "Memoria"를 빠르게 다섯 번 누르면 "Come As You Are"의 "memoria~" 구간이 흐른다.
// 음원은 public/easter/memoria.mp3. 재생이 안 되면 화면 효과만 나온다.

const CLIP = `${import.meta.env.BASE_URL}easter/memoria.mp3`
const SHOW_MS = 6000 // 음원이 없을 때 화면 효과 길이
const NOTES = ['♪', '♫', '♩', '♬']

export function EasterEgg({ onEnd }: { onEnd: () => void }) {
  const end = useRef(onEnd)
  end.current = onEnd

  useEffect(() => {
    const audio = new Audio(CLIP)
    const timer = window.setTimeout(() => end.current(), SHOW_MS)
    audio.onended = () => end.current()
    audio
      .play()
      // 재생되면 음원이 끝날 때까지 보여준다
      .then(() => window.clearTimeout(timer))
      .catch(() => {})
    return () => {
      window.clearTimeout(timer)
      audio.pause()
    }
  }, [])

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
