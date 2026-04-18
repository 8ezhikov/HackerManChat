import { create } from 'zustand'
import type { User } from '../lib/types'
import { clearTokens, setTokens, onLogout } from '../lib/api'

type AuthStore = {
  user: User | null
  setAuth: (user: User, access: string, refresh: string) => void
  logout: () => void
}

export const useAuth = create<AuthStore>((set) => {
  const store: AuthStore = {
    user: null,
    setAuth: (user, access, refresh) => {
      setTokens(access, refresh)
      set({ user })
    },
    logout: () => {
      clearTokens()
      set({ user: null })
    },
  }
  onLogout(store.logout)
  return store
})
