import { describe, it, expect, beforeEach } from 'vitest'
import { usePresence } from '../../store/presence'

describe('presence store', () => {
  beforeEach(() => {
    usePresence.setState({ presences: {} })
  })

  it('setPresence updates single user status', () => {
    usePresence.getState().setPresence('user-1', 'online')
    expect(usePresence.getState().presences['user-1']).toBe('online')

    usePresence.getState().setPresence('user-1', 'afk')
    expect(usePresence.getState().presences['user-1']).toBe('afk')
  })

  it('setAll replaces entire presence map', () => {
    usePresence.getState().setPresence('user-1', 'online')
    usePresence.getState().setAll({ 'user-2': 'offline', 'user-3': 'afk' })

    const presences = usePresence.getState().presences
    expect(presences['user-1']).toBeUndefined()
    expect(presences['user-2']).toBe('offline')
    expect(presences['user-3']).toBe('afk')
  })
})
