import { useState } from 'react'
import { signIn } from '../lib/auth'
import { TitleBar } from './TitleBar'

export function Login() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const onClick = async () => {
    setBusy(true)
    setError('')
    try {
      await signIn()
    } catch (e) {
      // Tauri invoke는 문자열로 reject한다
      setError(e instanceof Error ? e.message : String(e))
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
