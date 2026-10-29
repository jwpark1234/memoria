// 이스터에그 음악: Nirvana "Come As You Are"의 "memoria~" 구간을 8비트로 편곡해 그 자리에서 합성한다.
// 받은 음원에서 음을 따서 옮겼다 (120 BPM, Em - G 두 마디를 네 번). 음원 파일은 앱에 넣지 않는다.
// 보컬은 펄스파, 기타는 더 얇은 펄스파, 베이스는 삼각파, 드럼은 잡음과 음이 떨어지는 삼각파.

const BPM = 120
const STEP = 60 / BPM / 2 // 8분음표 (초)

// [음, 길이(8분음표 개수), 다음 음으로 미끄러짐]. '-'는 쉼표, 'E3+B3'은 같이 치는 음.
type Part = [string, number, boolean?][]

// "me-mo-ri-a": 라#에서 시로 올라가 끌다가, 라#을 거쳐 솔로 미끄러져 내려온다. 다음 "me"는 마디 마지막 8분음표.
const MEMORIA: Part = [
  ['A#3', 1, true], ['B3', 2],
  ['B3', 3, true], ['A#3', 1, true], ['G3', 8],
  ['-', 1],
]
// 첫 "me"는 반주보다 8분음표 하나 먼저 들어간다 (반주는 그만큼 쉬고 시작한다)
const LEAD: Part = [...MEMORIA, ...MEMORIA, ...MEMORIA, ...MEMORIA.slice(0, -2), ['G3', 9]]

const eighths = (note: string, n: number): Part => Array.from({ length: n }, () => [note, 1])
// Em(중간에 A를 짚는다) - G(끝에 B, C로 올라간다). G는 8분음표 하나 당겨 들어온다.
const GUITAR_BARS: Part = [
  ...eighths('E3+B3', 4), ...eighths('E3+A3', 2),
  ...eighths('G3+D4', 6), ...eighths('G3+B3', 2), ['G3+C4', 1], ['-', 1],
]
const BASS_BARS: Part = [...eighths('E2', 6), ['F#2', 1], ...eighths('G2', 8), ['D#2', 1]]
const repeat = (bars: Part, n: number): Part => [['-', 1], ...Array.from({ length: n }, () => bars).flat()]
const GUITAR = repeat(GUITAR_BARS, 4)
const BASS = repeat(BASS_BARS, 4)
const BARS = 8 // 두 마디씩 네 번
const GLIDE = 0.15 // 미끄러지는 시간 (초)

const SEMITONE: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }

// "A4" → 440Hz
function freq(note: string): number {
  const m = /^([A-G])(#?)(\d)$/.exec(note)!
  const n = SEMITONE[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12
  return 440 * 2 ** (n / 12)
}

export interface Song {
  duration: number // 초
  stop: () => void
}

/** 곡을 튼다. 휴대폰은 소리를 화면을 누른 순간에만 켤 수 있어서 누름 처리 안에서 바로 불러야 한다. */
export function playChiptune(): Song | null {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  const ctx = new Ctx()
  ctx.resume().catch(() => {})
  const out = ctx.createGain()
  out.gain.value = 0.5
  out.connect(ctx.destination)
  const t0 = ctx.currentTime + 0.05

  // 패미컴처럼 폭이 좁은 펄스파 (duty: 켜져 있는 비율)
  const pulse = (duty: number) => {
    const n = 32
    const real = new Float32Array(n)
    const imag = new Float32Array(n)
    for (let k = 1; k < n; k++) real[k] = (2 * Math.sin(Math.PI * k * duty)) / (Math.PI * k)
    return ctx.createPeriodicWave(real, imag)
  }
  const leadWave = pulse(0.25)
  const guitarWave = pulse(0.125)

  // 보컬 떨림: 음높이를 초당 5.5번 살짝 흔든다
  const lfo = ctx.createOscillator()
  const depth = ctx.createGain()
  lfo.frequency.value = 5.5
  depth.gain.value = 12 // cents
  lfo.connect(depth)
  lfo.start(t0)

  // 미끄러지며 이어지는 음들을 오실레이터 하나로 낸다
  const voice = (wave: PeriodicWave | OscillatorType, notes: [number, number][], at: number, vol: number, wobble: boolean) => {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    if (wave instanceof PeriodicWave) osc.setPeriodicWave(wave)
    else osc.type = wave
    let t = at
    notes.forEach(([f, len], i) => {
      osc.frequency.setValueAtTime(f, t)
      const next = notes[i + 1]
      if (next) {
        const g = Math.min(GLIDE, len * 0.6)
        osc.frequency.setValueAtTime(f, t + len - g)
        osc.frequency.exponentialRampToValueAtTime(next[0], t + len)
      }
      t += len
    })
    if (wobble) depth.connect(osc.detune)
    // 8비트 소리처럼 바로 켜지고, 조금 줄었다가, 끝에서 짧게 꺼진다
    const end = t - 0.02
    env.gain.setValueAtTime(0, at)
    env.gain.linearRampToValueAtTime(vol, at + 0.005)
    env.gain.linearRampToValueAtTime(vol * 0.7, at + 0.08)
    env.gain.setValueAtTime(vol * 0.7, end - 0.03)
    env.gain.linearRampToValueAtTime(0, end)
    osc.connect(env).connect(out)
    osc.start(at)
    osc.stop(end + 0.01)
  }

  const play = (part: Part, wave: PeriodicWave | OscillatorType, vol: number, wobble: boolean) => {
    let at = t0
    let run: [number, number][] = []
    let runAt = t0
    part.forEach(([note, steps, tie], i) => {
      const len = steps * STEP
      if (note !== '-') {
        const notes = note.split('+')
        if (notes.length > 1) notes.forEach((n) => voice(wave, [[freq(n), len * 0.85]], at, vol, wobble))
        else {
          if (!run.length) runAt = at
          run.push([freq(note), len])
          if (!tie || i === part.length - 1) {
            voice(wave, run, runAt, vol, wobble)
            run = []
          }
        }
      }
      at += len
    })
    return at - t0
  }

  const lead = play(LEAD, leadWave, 0.11, true)
  play(GUITAR, guitarWave, 0.03, false)
  play(BASS, 'triangle', 0.24, false)

  // 드럼: 1·3박 킥(음이 뚝 떨어지는 삼각파), 2·4박 스네어, 8분음표마다 하이햇
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const hit = (at: number, cutoff: number, vol: number, len: number) => {
    const src = ctx.createBufferSource()
    const env = ctx.createGain()
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = cutoff
    src.buffer = noise
    env.gain.setValueAtTime(vol, at)
    env.gain.exponentialRampToValueAtTime(0.001, at + len)
    src.connect(hp).connect(env).connect(out)
    src.start(at)
    src.stop(at + len)
  }
  const kick = (at: number) => {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(160, at)
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.12)
    env.gain.setValueAtTime(0.45, at)
    env.gain.exponentialRampToValueAtTime(0.001, at + 0.15)
    osc.connect(env).connect(out)
    osc.start(at)
    osc.stop(at + 0.16)
  }
  const beats = BARS * 8
  for (let i = 0; i < beats; i++) {
    const at = t0 + (i + 1) * STEP
    if (i % 4 === 0) kick(at)
    if (i % 4 === 2) hit(at, 1500, 0.12, 0.12)
    hit(at, 7000, 0.04, 0.04)
  }

  const duration = lead + 0.3
  const stop = () => {
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
    window.setTimeout(() => ctx.close().catch(() => {}), 300)
  }
  window.setTimeout(() => ctx.state !== 'closed' && ctx.close().catch(() => {}), (duration + 0.5) * 1000)
  return { duration, stop }
}
