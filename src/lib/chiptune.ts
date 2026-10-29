// 이스터에그 음악: 8비트 게임 음악처럼 사각파 멜로디 + 삼각파 베이스 + 잡음 하이햇을 그 자리에서 합성한다.
// 이 앱을 위해 새로 지은 곡이라 음원 파일도, 저작권 걱정도 없다. 물속처럼 출렁이게 멜로디에 비브라토를 건다.

const BPM = 126
const STEP = 60 / BPM / 2 // 8분음표 (초)

// [음, 길이(8분음표 개수)]. '-'는 쉼표. 가단조, 화음은 Am - C - F - G - Am
const LEAD: [string, number][] = [
  ['A4', 1], ['C5', 1], ['E5', 1], ['A5', 2], ['G5', 1], ['E5', 1], ['D5', 1],
  ['E5', 1], ['G5', 1], ['C6', 2], ['B5', 1], ['G5', 1], ['E5', 2],
  ['F5', 1], ['A5', 1], ['C6', 1], ['A5', 1], ['G5', 1], ['F5', 1], ['E5', 1], ['C5', 1],
  ['D5', 1], ['G5', 1], ['B5', 1], ['D6', 1], ['C6', 1], ['B5', 1], ['G5', 2],
  ['A5', 6], ['-', 2],
]
const BASS: [string, number][] = [
  ['A2', 2], ['A3', 2], ['A2', 2], ['E3', 2],
  ['C3', 2], ['C4', 2], ['C3', 2], ['G3', 2],
  ['F2', 2], ['F3', 2], ['F2', 2], ['C3', 2],
  ['G2', 2], ['G3', 2], ['G2', 2], ['D3', 2],
  ['A2', 8],
]

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

  // 출렁임: 멜로디 음높이를 초당 5번 살짝 흔든다
  const lfo = ctx.createOscillator()
  const depth = ctx.createGain()
  lfo.frequency.value = 5
  depth.gain.value = 6 // cents
  lfo.connect(depth)
  lfo.start(t0)

  const tone = (type: OscillatorType, f: number, at: number, len: number, vol: number, wobble: boolean) => {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = type
    osc.frequency.value = f
    if (wobble) depth.connect(osc.detune)
    // 8비트 소리처럼 바로 켜지고, 조금 줄었다가, 끝에서 짧게 꺼진다
    env.gain.setValueAtTime(0, at)
    env.gain.linearRampToValueAtTime(vol, at + 0.005)
    env.gain.linearRampToValueAtTime(vol * 0.6, at + 0.08)
    env.gain.setValueAtTime(vol * 0.6, at + len - 0.04)
    env.gain.linearRampToValueAtTime(0, at + len)
    osc.connect(env).connect(out)
    osc.start(at)
    osc.stop(at + len + 0.01)
  }

  const play = (part: [string, number][], type: OscillatorType, vol: number, wobble: boolean) => {
    let at = t0
    for (const [note, steps] of part) {
      const len = steps * STEP
      if (note !== '-') tone(type, freq(note), at, len * 0.92, vol, wobble)
      at += len
    }
    return at - t0
  }

  const lead = play(LEAD, 'square', 0.09, true)
  // 메아리: 멜로디를 한 박자 늦게 작게 한 번 더 (물속 느낌)
  let at = t0 + STEP * 3
  for (const [note, steps] of LEAD) {
    if (note !== '-') tone('square', freq(note), at, steps * STEP * 0.9, 0.025, true)
    at += steps * STEP
  }
  play(BASS, 'triangle', 0.22, false)

  // 하이햇: 짧은 잡음을 엇박에
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  for (let i = 1; i < Math.round(lead / STEP) - 6; i += 2) {
    const src = ctx.createBufferSource()
    const env = ctx.createGain()
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 7000
    src.buffer = noise
    env.gain.setValueAtTime(0.06, t0 + i * STEP)
    env.gain.exponentialRampToValueAtTime(0.001, t0 + i * STEP + 0.04)
    src.connect(hp).connect(env).connect(out)
    src.start(t0 + i * STEP)
  }

  const duration = lead + STEP * 3 + 0.3
  const stop = () => {
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
    window.setTimeout(() => ctx.close().catch(() => {}), 300)
  }
  window.setTimeout(() => ctx.state !== 'closed' && ctx.close().catch(() => {}), (duration + 0.5) * 1000)
  return { duration, stop }
}
