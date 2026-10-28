import { useEffect, useState } from 'react'
import { checkRedirectResult, signIn } from '../lib/auth'
import { TitleBar } from './TitleBar'

// Tauri invoke는 문자열로, Firebase는 code가 있는 Error로 reject한다
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function Login() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 구글에서 돌아왔는데 로그인 화면이면 실패한 것이다. 조용히 첫 화면으로 돌아가지 않게 이유를 보여준다.
  useEffect(() => {
    checkRedirectResult().catch((e) => setError(message(e)))
  }, [])

  const onClick = async () => {
    setBusy(true)
    setError('')
    try {
      await signIn()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <TitleBar />
      <main className="login">
        <img src="/icon.svg" width={56} height={56} alt="" />
        <p>어디서든 같은 메모.</p>
        <button className="primary" disabled={busy} onClick={onClick}>
          {busy ? '브라우저에서 로그인 중…' : 'Google로 로그인'}
        </button>
        {error && <p className="error">{error}</p>}
      </main>
    </div>
  )
}
