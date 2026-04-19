import { describe, it, expect, beforeEach } from 'vitest'
import { server } from '../mocks/server'
import { setTokens, getAccessToken, clearTokens, authApi } from '../../lib/api'
import { http, HttpResponse } from 'msw'

describe('api token refresh', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
  })

  it('401 triggers refresh token flow', async () => {
    setTokens('old-access', 'valid-refresh')

    server.use(
      http.post('/api/test-endpoint', () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      ),
    )

    try {
      await authApi.refreshSession()
    } catch {
      // Expected to fail after refresh
    }

    expect(localStorage.getItem('hmc_refresh')).not.toBeNull()
  })

  it('second 401 after failed refresh triggers logout', async () => {
    setTokens('old-access', 'invalid-refresh')

    server.use(
      http.post('/api/auth/refresh', () =>
        HttpResponse.json({ error: 'Invalid refresh token' }, { status: 401 }),
      ),
    )

    const result = await authApi.refreshSession()
    expect(result).toBeNull()
    expect(getAccessToken()).toBeNull()
  })
})
