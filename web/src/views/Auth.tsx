import { useState, useEffect, type FormEvent } from 'react'
import { authApi } from '../lib/api'
import { useAuth } from '../store/auth'

type Mode = 'login' | 'register' | 'forgot' | 'reset'

export default function Auth() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const setAuth = useAuth((s) => s.setAuth)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const emailParam = params.get('email')
    if (token && emailParam) {
      setResetToken(token)
      setEmail(emailParam)
      setMode('reset')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  function reset() { setError(''); setInfo('') }

  async function submit(e: FormEvent) {
    e.preventDefault()
    reset()
    setLoading(true)
    try {
      if (mode === 'login') {
        const res = await authApi.login(email, password, rememberMe)
        setAuth(res.user, res.accessToken, res.refreshToken)
      } else if (mode === 'register') {
        const res = await authApi.register(email, username, password)
        setAuth(res.user, res.accessToken, res.refreshToken)
      } else if (mode === 'forgot') {
        await authApi.requestPasswordReset(email)
        setInfo('If that email is registered, a reset link has been sent. Check your inbox (or mailhog on :8025).')
      } else if (mode === 'reset') {
        await authApi.resetPassword(email, resetToken, newPassword)
        setInfo('Password reset! You can now sign in.')
        setMode('login')
        setEmail('')
        setResetToken('')
        setNewPassword('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const subtitles: Record<Mode, string> = {
    login: 'AUTHENTICATE // ACCESS GRANTED',
    register: 'INITIALIZE // NEW OPERATIVE',
    forgot: 'RECOVER // CREDENTIALS LOST',
    reset: 'OVERRIDE // SET NEW PASSPHRASE',
  }

  const buttonLabels: Record<Mode, string> = {
    login: 'SIGN_IN',
    register: 'CREATE_ACCOUNT',
    forgot: 'SEND_RESET_LINK',
    reset: 'RESET_PASSWORD',
  }

  const inputCls = "w-full px-3.5 py-3 outline-none font-label text-[12px] uppercase tracking-[0.15em]"
  const inputStyle = { background: 'var(--surface-mid)', border: 'none', borderBottom: '1px solid transparent', color: 'var(--on-surface)' }

  return (
    <div className="min-h-screen bg-[#0e0e0e] bg-grid crt-vignette flex items-center justify-center px-4">
      <div className="scanlines" />
      <div className="w-full max-w-sm p-8" style={{ background: 'var(--surface-low)', border: '1px solid var(--surface-highest)', boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 60px rgba(157,0,255,0.08)' }}>
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-headline font-bold chromatic-aberration uppercase tracking-tighter mb-1" style={{ fontSize: 22, color: 'var(--primary)', lineHeight: 1.1 }}>
            HACKER_MAN //<br />TERMINAL
          </h1>
          <p className="font-label text-[10px] uppercase tracking-[0.3em] mt-2" style={{ color: 'var(--outline)' }}>
            {subtitles[mode]}
          </p>
          <div className="mt-3.5 h-px bg-gradient-to-r from-[#9d00ff] to-transparent" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode !== 'reset' && (
            <input
              type="email"
              placeholder="EMAIL_ADDRESS"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputCls}
              style={inputStyle}
            />
          )}
          {mode === 'register' && (
            <input
              type="text"
              placeholder="USERNAME"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className={inputCls}
              style={inputStyle}
            />
          )}
          {(mode === 'login' || mode === 'register') && (
            <input
              type="password"
              placeholder="PASSWORD"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={inputCls}
              style={inputStyle}
            />
          )}
          {mode === 'reset' && (
            <input
              type="password"
              placeholder="NEW_PASSWORD (min 8 chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className={inputCls}
              style={inputStyle}
            />
          )}
          {mode === 'login' && (
            <label className="flex items-center gap-3 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 bg-[#201f1f] border border-[#353534] accent-[#9d00ff]"
              />
              <span className="text-[#b8aac2] text-sm font-label uppercase tracking-wider">Remember me for 90 days</span>
            </label>
          )}
          {error && (
            <ul className="space-y-0.5 bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 px-3 py-2">
              {error.split('\n').map((e, i) => (
                <li key={i} className="text-[#ffb4ab] text-sm font-label">// {e}</li>
              ))}
            </ul>
          )}
          {info && (
            <p className="text-[#d5baff] text-sm font-label bg-[#9d00ff]/10 border border-[#9d00ff]/20 px-3 py-2">
              // {info}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full font-bold font-label py-3 text-[11px] tracking-[0.3em] uppercase transition-all"
            style={{ background: 'var(--primary-cta)', color: 'white', opacity: loading ? 0.4 : 1, marginTop: 4 }}
          >
            {loading ? 'PROCESSING...' : buttonLabels[mode]}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          {mode === 'login' && (
            <>
              <p className="text-sm text-[#b8aac2] font-label uppercase tracking-wider">
                No account?{' '}
                <button
                  onClick={() => { setMode('register'); reset() }}
                  className="text-[#dfb7ff] hover:text-white transition-colors"
                >
                  REGISTER
                </button>
              </p>
              <p>
                <button
                  onClick={() => { setMode('forgot'); reset() }}
                  className="text-sm text-[#b8aac2] font-label uppercase tracking-wider hover:text-[#dfb7ff] transition-colors"
                >
                  Forgot password?
                </button>
              </p>
            </>
          )}
          {(mode === 'register' || mode === 'forgot' || mode === 'reset') && (
            <p>
              <button
                onClick={() => { setMode('login'); reset() }}
                className="text-sm text-[#b8aac2] font-label uppercase tracking-wider hover:text-[#dfb7ff] transition-colors"
              >
                ← BACK_TO_LOGIN
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
