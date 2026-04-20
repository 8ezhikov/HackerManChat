import { useEffect } from 'react'
import { useAuth } from './store/auth'
import { authApi, hasRefreshToken } from './lib/api'
import Auth from './views/Auth'
import ChatApp from './views/ChatApp'

export default function App() {
  const { user, setAuth, logout } = useAuth()

  // On first load, try to restore session from the stored refresh token
  useEffect(() => {
    if (user || !hasRefreshToken()) return
    authApi.refreshSession()
      .then((res) => { if (res) setAuth(res.user, res.accessToken, res.refreshToken); else logout() })
      .catch(logout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="scanlines" />
      {user ? <ChatApp /> : <Auth />}
    </>
  )
}
