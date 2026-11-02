import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { auth, db } from './firebase'
import { useWidget } from './widget'

// 부산 버스 도착정보. 정류소+노선을 즐겨찾기해 두면 그 도착정보만 계속 받아 온다.
// 공공데이터포털은 앱에서 바로 부를 수 없어서(인증키 노출, CORS) 푸시 Worker(push/src/bus.ts)가 대신 부른다.
// 즐겨찾기는 기기끼리 같이 쓰게 Firestore(users/{uid}/meta/bus)에 둔다.

/** 푸시 Worker 주소. 비어 있으면 버스 기능을 숨긴다. */
export const BUS_API: string = 'https://memoria-push.jwpark1988.workers.dev'
export const busEnabled = BUS_API !== ''

// 공공데이터포털은 하루 10,000회까지 부를 수 있다. 정류소 하나에 한 번씩 부르므로 보이는 동안 30초마다,
// 30분 넘게 손대지 않으면 멈춘다 (PC 위젯은 늘 떠 있어서). 누르면 다시 받는다.
// 정류소 3곳을 하루 종일 받아도 30초마다면 8,640회라 한도 안이다. Worker도 30초 동안 같은 결과를 나눠 준다.
const REFRESH_MS = 30_000
const IDLE_MS = 30 * 60_000

export interface BusFavorite {
  bstopid: string // 정류소 ID (9자리)
  arsno: string // 정류소 번호 (5자리)
  stop: string // 정류소 이름
  lineid: string
  lineno: string // 버스 번호
}

// push/src/bus.ts와 같은 모양
export interface Stop {
  bstopid: string
  name: string
  arsno: string
}
export interface Bus {
  min: number | null
  stops: number | null
  low: boolean
  seat: number | null
}
export interface Arrival {
  lineid: string
  lineno: string
  bustype: string
  status: string
  buses: Bus[]
}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('로그인이 필요합니다')
  const res = await fetch(`${BUS_API}${path}?${new URLSearchParams(params)}`, { headers: { authorization: `Bearer ${token}` } })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? `HTTP ${res.status}`)
  return body as T
}

/** 정류소 찾기: 이름 또는 정류소 번호(5자리) */
export const searchStops = (q: string) => call<Stop[]>('/bus/stops', { q })
/** 정류소에 서는 노선들의 도착정보 */
export const stopArrivals = (bstopid: string) => call<Arrival[]>('/bus/arrivals', { bstopid })

// ── 즐겨찾기 ──

const favRef = (uid: string) => doc(db, 'users', uid, 'meta', 'bus')

export function useBusFavorites(uid: string): BusFavorite[] {
  const [list, setList] = useState<BusFavorite[]>([])
  useEffect(() => {
    if (!busEnabled) return
    return onSnapshot(
      favRef(uid),
      (snap) => setList((snap.data()?.favorites as BusFavorite[] | undefined) ?? []),
      (e) => console.error('[bus]', e),
    )
  }, [uid])
  return list
}

export function setBusFavorites(uid: string, favorites: BusFavorite[]) {
  setDoc(favRef(uid), { favorites, updatedAt: serverTimestamp() }).catch((e) => console.error('[bus]', e))
}

export const sameFavorite = (a: BusFavorite, b: Pick<BusFavorite, 'bstopid' | 'lineid'>) =>
  a.bstopid === b.bstopid && a.lineid === b.lineid

// ── 도착정보 받아 오기 ──

const subscribeVisibility = (l: () => void) => {
  document.addEventListener('visibilitychange', l)
  return () => document.removeEventListener('visibilitychange', l)
}
const useVisible = () => useSyncExternalStore(subscribeVisibility, () => document.visibilityState === 'visible')

// 마지막으로 손댄 지 IDLE_MS가 지났는지. 마우스를 위젯 위에서 움직이거나 화면을 누르면 다시 깬다.
function useIdle() {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    let last = Date.now()
    const wake = () => {
      const now = Date.now()
      if (now - last < 1000) return
      last = now
      setIdle(false)
    }
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'focus'] as const
    for (const e of events) window.addEventListener(e, wake, { passive: true })
    const timer = window.setInterval(() => Date.now() - last > IDLE_MS && setIdle(true), 30_000)
    return () => {
      for (const e of events) window.removeEventListener(e, wake)
      window.clearInterval(timer)
    }
  }, [])
  return idle
}

export interface Arrivals {
  byStop: Record<string, Arrival[]>
  at: number // 마지막으로 받은 시각 (0 = 아직)
  error: string | null
  loading: boolean
  paused: boolean // 손대지 않아서 멈춤
  refresh: () => void
}

/** 즐겨찾기한 정류소들의 도착정보. 보이는 동안(PC 미니모드 아님) 30초마다 새로 받는다. */
export function useArrivals(favorites: BusFavorite[]): Arrivals {
  const stops = [...new Set(favorites.map((f) => f.bstopid))].sort().join(',')
  const [state, setState] = useState<Omit<Arrivals, 'paused' | 'refresh'>>({ byStop: {}, at: 0, error: null, loading: false })
  const visible = useVisible()
  const { mini } = useWidget()
  const idle = useIdle()
  const last = useRef(0)

  const refresh = useCallback(async () => {
    if (!stops) return
    setState((s) => ({ ...s, loading: true }))
    try {
      const ids = stops.split(',')
      const lists = await Promise.all(ids.map(stopArrivals))
      last.current = Date.now()
      setState({ byStop: Object.fromEntries(ids.map((id, i) => [id, lists[i]])), at: last.current, error: null, loading: false })
    } catch (e) {
      // 실패해도 바로 다시 부르지 않고 다음 주기까지 기다린다
      last.current = Date.now()
      setState((s) => ({ ...s, error: (e as Error).message, loading: false }))
    }
  }, [stops])

  // 즐겨찾기 정류소가 바뀌면 기다리지 않고 받는다
  useEffect(() => {
    last.current = 0
  }, [stops])

  const active = !!stops && visible && !mini && !idle
  useEffect(() => {
    if (!active) return
    let stop = false
    let timer: number | undefined
    const tick = () => {
      refresh().finally(() => {
        if (!stop) timer = window.setTimeout(tick, REFRESH_MS)
      })
    }
    timer = window.setTimeout(tick, Math.max(0, last.current + REFRESH_MS - Date.now()))
    return () => {
      stop = true
      window.clearTimeout(timer)
    }
  }, [active, refresh])

  return { ...state, paused: idle && !!stops, refresh }
}
