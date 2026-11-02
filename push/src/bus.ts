// 부산 버스 도착정보 중계. 앱(src/lib/bus.ts)이 즐겨찾기한 정류소의 도착정보를 여기서 받아 간다.
// 공공데이터포털 인증키를 앱에 넣으면 누구나 볼 수 있고, 포털은 브라우저에서 바로 부르는 것(CORS)도 막아서 Worker가 대신 부른다.
// 소유자의 Firebase 로그인 토큰이 있어야 답한다 (남이 이 주소로 하루 호출 한도를 써 버리지 않게).
//
// API: 부산광역시_부산버스정보시스템 https://www.data.go.kr/data/15092750/openapi.do (무료, XML)

export interface BusEnv {
  BUSAN_BUS_KEY?: string // 공공데이터포털 일반 인증키(Decoding) (wrangler secret)
  FIREBASE_SA: string
  OWNER_UID: string
}

const API = 'https://apis.data.go.kr/6260000/BusanBIMS'
// PC와 휴대폰이 같이 켜져 있어도 같은 정류소는 이 시간 안에 한 번만 부른다 (포털 하루 호출 한도).
// Worker 인스턴스의 메모리라 늘 맞지는 않지만, 같은 시각 요청은 대개 같은 인스턴스로 간다.
const CACHE_MS = 30_000

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-max-age': '86400',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

export async function handleBus(req: Request, env: BusEnv): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'GET') return json({ error: 'method' }, 405)

  const project = (JSON.parse(env.FIREBASE_SA) as { project_id: string }).project_id
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!(await verifyIdToken(token, project, env.OWNER_UID).catch(() => false))) return json({ error: 'unauthorized' }, 401)
  if (!env.BUSAN_BUS_KEY) return json({ error: '인증키가 없습니다 (BUSAN_BUS_KEY)' }, 503)

  const url = new URL(req.url)
  try {
    if (url.pathname === '/bus/stops') {
      // 정류소 찾기: 다섯 자리 숫자면 정류소 번호(ARS), 아니면 이름
      const q = (url.searchParams.get('q') ?? '').trim()
      if (!q) return json([])
      const byArs = /^\d{5}$/.test(q)
      return json(await cached(`stops:${q}`, () => searchStops(env.BUSAN_BUS_KEY!, byArs ? { arsno: q } : { bstopnm: q })))
    }
    if (url.pathname === '/bus/arrivals') {
      const id = url.searchParams.get('bstopid') ?? ''
      if (!/^\d{9}$/.test(id)) return json({ error: 'bstopid' }, 400)
      return json(await cached(`arr:${id}`, () => arrivals(env.BUSAN_BUS_KEY!, id)))
    }
    return json({ error: 'not found' }, 404)
  } catch (e) {
    console.error('bus', e)
    return json({ error: String((e as Error).message ?? e) }, 502)
  }
}

// ── 캐시 ────────────────────────────────────────────────────────────────

const cache = new Map<string, { at: number; value: Promise<unknown> }>()

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_MS) return hit.value as Promise<T>
  const value = load()
  cache.set(key, { at: now, value })
  // 실패한 결과는 남기지 않는다
  value.catch(() => cache.get(key)?.value === value && cache.delete(key))
  if (cache.size > 200) for (const [k, v] of cache) if (now - v.at >= CACHE_MS) cache.delete(k)
  return value
}

// ── 공공데이터포털 ──────────────────────────────────────────────────────

type Item = Record<string, string>

const decodeXml = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos|#\d+);/g, (_, e: string) =>
    e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'" : String.fromCharCode(Number(e.slice(1))),
  )

// 응답은 <item> 안에 값이 한 단계로만 들어 있어서 정규식으로 충분하다 (Worker에는 XML 파서가 없다)
async function call(op: string, params: Record<string, string>, key: string): Promise<Item[]> {
  const res = await fetch(`${API}/${op}?${new URLSearchParams({ serviceKey: key, ...params })}`)
  const xml = await res.text()
  const err = /<(?:errMsg|returnAuthMsg)>([^<]*)</.exec(xml)
  const code = /<resultCode>([^<]*)</.exec(xml)?.[1]
  if (!res.ok || (code && code !== '00') || (err && !code)) {
    const msg = /<resultMsg>([^<]*)</.exec(xml)?.[1] ?? err?.[1] ?? `HTTP ${res.status}`
    throw new Error(`${op}: ${decodeXml(msg)}`)
  }
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) =>
    Object.fromEntries([...m[1].matchAll(/<(\w+)>([^<]*)<\/\1>/g)].map((f) => [f[1], decodeXml(f[2]).trim()])),
  )
}

/** 정류소 */
export interface Stop {
  bstopid: string // 정류소 ID (9자리)
  name: string
  arsno: string // 정류소 번호 (5자리, 정류장 표지판의 번호)
}

async function searchStops(key: string, by: Record<string, string>): Promise<Stop[]> {
  const items = await call('busStopList', { ...by, pageNo: '1', numOfRows: '30' }, key)
  return items.map((i) => ({ bstopid: i.bstopid ?? '', name: i.bstopnm ?? '', arsno: i.arsno ?? '' })).filter((s) => s.bstopid)
}

/** 다가오는 버스 한 대 */
export interface Bus {
  min: number | null // 도착까지 남은 분
  stops: number | null // 남은 정류소 수
  low: boolean // 저상버스
  seat: number | null // 빈 좌석 (모르면 null)
}

/** 정류소에 서는 노선 하나의 도착정보 */
export interface Arrival {
  lineid: string
  lineno: string // 버스 번호
  bustype: string // 일반버스, 급행버스, 마을버스 …
  status: string // 남은 분 대신 오는 글자 (예: 운행대기)
  buses: Bus[] // 앞차, 뒷차
}

const num = (v: string | undefined) => {
  const n = Number(v)
  return v && v.trim() !== '' && Number.isFinite(n) ? n : null
}

async function arrivals(key: string, bstopid: string): Promise<Arrival[]> {
  const items = await call('stopArrByBstopid', { bstopid }, key)
  return items
    .filter((i) => i.lineid)
    .map((i) => {
      const buses: Bus[] = []
      let status = ''
      for (const n of ['1', '2']) {
        const min = num(i[`min${n}`])
        if (min === null) {
          if (n === '1' && i.min1) status = i.min1
          continue
        }
        const seat = num(i[`seat${n}`])
        buses.push({ min, stops: num(i[`station${n}`]), low: i[`lowplate${n}`] === '1', seat: seat !== null && seat >= 0 ? seat : null })
      }
      return { lineid: i.lineid, lineno: i.lineno ?? '', bustype: i.bustype ?? '', status, buses }
    })
}

// ── Firebase 로그인 토큰 확인 ───────────────────────────────────────────
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

const JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
let jwks: { at: number; keys: (JsonWebKey & { kid: string })[] } | null = null

async function publicKeys() {
  if (jwks && Date.now() - jwks.at < 3600_000) return jwks.keys
  const res = await fetch(JWKS)
  if (!res.ok) throw new Error(`jwks ${res.status}`)
  jwks = { at: Date.now(), keys: ((await res.json()) as { keys: (JsonWebKey & { kid: string })[] }).keys }
  return jwks.keys
}

const b64urlBytes = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0))
const b64urlJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)))

async function verifyIdToken(token: string, project: string, uid: string): Promise<boolean> {
  const [h, p, s] = token.split('.')
  if (!h || !p || !s) return false
  const header = b64urlJson(h) as { alg?: string; kid?: string }
  const claims = b64urlJson(p) as { aud?: string; iss?: string; sub?: string; exp?: number; iat?: number }
  const now = Date.now() / 1000
  if (header.alg !== 'RS256') return false
  if (claims.aud !== project || claims.iss !== `https://securetoken.google.com/${project}`) return false
  if (claims.sub !== uid || !claims.exp || claims.exp < now || !claims.iat || claims.iat > now + 300) return false
  const jwk = (await publicKeys()).find((k) => k.kid === header.kid)
  if (!jwk) return false
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`))
}
