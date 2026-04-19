import { describe, it, expect, beforeEach } from 'vitest'
import { useAuth } from '../../store/auth'
import * as apiLib from '../../lib/api'

describe('auth store', () => {
  beforeEach(() => {
    useAuth.setState({ user: null })
    localStorage.clear()
  })

  it('setAuth persists tokens to localStorage', () => {
    const user = { id: '1', username: 'test', email: 'test@example.com', displayName: 'Test' }
    useAuth.getState().setAuth(user, 'access', 'refresh')

    expect(localStorage.getItem('hmc_refresh')).toBe('refresh')
    expect(useAuth.getState().user).toEqual(user)
  })

  it('logout clears tokens and user', () => {
    const user = { id: '1', username: 'test', email: 'test@example.com', displayName: 'Test' }
    useAuth.getState().setAuth(user, 'access', 'refresh')
    useAuth.getState().logout()

    expect(localStorage.getItem('hmc_refresh')).toBeNull()
    expect(useAuth.getState().user).toBeNull()
  })
})
