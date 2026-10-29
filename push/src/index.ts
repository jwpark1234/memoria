// 일정 푸시 알림 (Cloudflare Worker, 1분마다 실행).
// 휴대폰(PWA)은 앱이 꺼져 있으면 스스로 알릴 수 없어서, 여기서 시각이 된 일정을 찾아 FCM으로 푸시를 보낸다.
// Firebase는 무료 요금제(Spark) 그대로 쓰고, 서비스 계정으로 Firestore와 FCM의 REST API를 부른다.
//
// 앱(src/lib/alarms.ts)이 쓰는 notified와 별개로 pushed를 둔다. PC 앱이 먼저 알리고 notified를 세워도
// 휴대폰에는 푸시가 가야 하기 때문이다.

interface Env {
  FIREBASE_SA: string // 서비스 계정 JSON (wrangler secret)
  OWNER_UID: string // 앱 소유자 uid (src/lib/auth.ts의 OWNER_UID)
}

interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

// 이만큼 지난 일정까지 보낸다. 실행이 한두 번 빠져도 놓치지 않게 넉넉히 둔다.
const WINDOW_MS = 15 * 60_000

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env))
  },
} satisfies ExportedHandler<Env>

async function run(env: Env) {
  const sa: ServiceAccount = JSON.parse(env.FIREBASE_SA)
  const token = await accessToken(sa)
  const db = new Firestore(sa.project_id, token, `users/${env.OWNER_UID}`)

  // `at` 하나에만 범위 조건을 걸어야 복합 색인 없이 조회된다. 나머지 조건은 여기서 거른다.
  // 대부분 결과가 없어서 1분에 읽기 1회(빈 결과도 1회로 센다)다.
  const now = Date.now()
  const due = (await db.query('schedules', 'at', new Date(now - WINDOW_MS), new Date(now))).filter(
    (d) => !d.fields.deleted?.booleanValue && !d.fields.done?.booleanValue && !d.fields.pushed?.booleanValue,
  )
  if (!due.length) return
  console.log(`due ${due.length}`)

  const devices = await db.list('devices')
  for (const s of due) {
    const title = s.fields.title?.stringValue || '일정'
    const noteId = s.fields.noteId?.stringValue
    const note = noteId ? await db.get(`notes/${noteId}`) : null
    const at = new Date(s.fields.at!.timestampValue!)
    const body = [formatTime(at), note && noteTitle(note)].filter(Boolean).join(' · ')

    for (const d of devices) {
      const fcmToken = d.fields.token?.stringValue
      if (!fcmToken) continue
      // tag: 앱이 직접 띄운 알림(src/lib/alarms.ts)과 같은 일정 id라 겹쳐 뜨지 않는다
      const gone = await sendPush(sa.project_id, token, fcmToken, { title, body, tag: s.name.split('/').pop()! })
      // 앱을 지웠거나 알림을 끈 기기
      if (gone) await db.delete(d.name)
    }
    await db.patch(s.name, { pushed: { booleanValue: true } })
  }
}

// ── 서비스 계정 → OAuth 액세스 토큰 ──────────────────────────────────────

const SCOPES = 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging'

const b64url = (data: ArrayBuffer | string) =>
  btoa(typeof data === 'string' ? data : String.fromCharCode(...new Uint8Array(data)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

async function accessToken(sa: ServiceAccount): Promise<string> {
  const iat = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }),
  )
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`))

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${b64url(sig)}`,
    }),
  })
  if (!res.ok) throw new Error(`token ${res.status} ${await res.text()}`)
  return ((await res.json()) as { access_token: string }).access_token
}

// ── Firestore REST ──────────────────────────────────────────────────────

interface Value {
  stringValue?: string
  booleanValue?: boolean
  timestampValue?: string
}

interface Doc {
  name: string // projects/…/documents/users/{uid}/…
  fields: Record<string, Value | undefined>
}

class Firestore {
  private root: string

  constructor(
    project: string,
    private token: string,
    private base: string,
  ) {
    this.root = `projects/${project}/databases/(default)/documents`
  }

  private async call(path: string, init: RequestInit = {}) {
    const res = await fetch(`https://firestore.googleapis.com/v1/${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
    })
    if (!res.ok) throw new Error(`firestore ${res.status} ${await res.text()}`)
    return res.json()
  }

  /** collection에서 field가 from~to 사이인 문서 */
  async query(collection: string, field: string, from: Date, to: Date): Promise<Doc[]> {
    const range = (op: string, d: Date) => ({
      fieldFilter: { field: { fieldPath: field }, op, value: { timestampValue: d.toISOString() } },
    })
    const rows = (await this.call(`${this.root}/${this.base}:runQuery`, {
      method: 'POST',
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: collection }],
          where: { compositeFilter: { op: 'AND', filters: [range('GREATER_THAN_OR_EQUAL', from), range('LESS_THAN_OR_EQUAL', to)] } },
        },
      }),
    })) as { document?: Doc }[]
    return rows.flatMap((r) => (r.document ? [{ ...r.document, fields: r.document.fields ?? {} }] : []))
  }

  async list(collection: string): Promise<Doc[]> {
    const res = (await this.call(`${this.root}/${this.base}/${collection}?pageSize=100`)) as { documents?: Doc[] }
    return res.documents ?? []
  }

  async get(path: string): Promise<Doc | null> {
    try {
      return (await this.call(`${this.root}/${this.base}/${path}`)) as Doc
    } catch {
      return null
    }
  }

  async patch(name: string, fields: Record<string, Value>) {
    const mask = Object.keys(fields)
      .map((f) => `updateMask.fieldPaths=${f}`)
      .join('&')
    await this.call(`${name}?${mask}`, { method: 'PATCH', body: JSON.stringify({ fields }) })
  }

  async delete(name: string) {
    await this.call(name, { method: 'DELETE' })
  }
}

// ── FCM ─────────────────────────────────────────────────────────────────

/** 푸시를 보낸다. 토큰이 더는 유효하지 않으면 true */
async function sendPush(project: string, token: string, fcmToken: string, data: Record<string, string>) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    // 알림 표시는 앱의 서비스워커(public/sw-notify.js)가 한다
    body: JSON.stringify({ message: { token: fcmToken, data, webpush: { headers: { Urgency: 'high', TTL: '3600' } } } }),
  })
  if (res.ok) return false
  const text = await res.text()
  if (res.status === 404 || text.includes('UNREGISTERED')) return true
  console.error('fcm', res.status, text)
  return false
}

// ── 표시 ───────────────────────────────────────────────────────────────

const timeFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' })
const formatTime = (d: Date) => timeFmt.format(d)

// 메모 제목: 따로 적은 제목이 없으면 내용의 첫 줄 (src/lib/markup.ts의 noteTitle)
function noteTitle(note: Doc): string {
  const title = note.fields.title?.stringValue?.trim()
  if (title) return title
  const first = (note.fields.text?.stringValue ?? '').trim().split('\n')[0]
  return first.replace(/^(\s*)- \[([ xX])\] /, (_, sp: string, c: string) => `${sp}${c === ' ' ? '☐' : '☑'} `)
}
