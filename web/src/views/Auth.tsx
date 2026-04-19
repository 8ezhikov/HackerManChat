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
      // Clean URL without reload
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

  const titles: Record<Mode, string> = {
    login: 'Welcome back.',
    register: 'Create an account.',
    forgot: 'Reset your password.',
    reset: 'Choose a new password.',
  }

  const buttonLabels: Record<Mode, string> = {
    login: 'Sign in',
    register: 'Create account',
    forgot: 'Send reset link',
    reset: 'Reset password',
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-white mb-1">HackerManChat</h1>
        <p className="text-gray-400 text-sm mb-6">{titles[mode]}</p>

        <form onSubmit={submit} className="space-y-4">
          {mode !== 'reset' && (
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
          {mode === 'register' && (
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
          {(mode === 'login' || mode === 'register') && (
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
          {mode === 'reset' && (
            <input
              type="password"
              placeholder="New password (min 8 chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
          {mode === 'login' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 bg-gray-800 border border-gray-700 rounded focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-gray-300 text-sm">Remember me for 90 days</span>
            </label>
          )}
          {error && (
            <ul className="space-y-0.5">
              {error.split('\n').map((e, i) => (
                <li key={i} className="text-red-400 text-xs">• {e}</li>
              ))}
            </ul>
          )}
          {info && <p className="text-green-400 text-xs">{info}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
          >
            {loading ? 'Please wait…' : buttonLabels[mode]}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-gray-500 space-y-1">
          {mode === 'login' && (
            <>
              <p>
                {"Don't have an account? "}
                <button onClick={() => { setMode('register'); reset() }} className="text-indigo-400 hover:text-indigo-300">Register</button>
              </p>
              <p>
                <button onClick={() => { setMode('forgot'); reset() }} className="text-indigo-400 hover:text-indigo-300">Forgot password?</button>
              </p>
            </>
          )}
          {(mode === 'register' || mode === 'forgot' || mode === 'reset') && (
            <p>
              <button onClick={() => { setMode('login'); reset() }} className="text-indigo-400 hover:text-indigo-300">Back to sign in</button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
