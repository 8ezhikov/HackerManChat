import { describe, it, expect, beforeEach } from 'vitest'
import { useUnread } from '../../store/unread'

describe('unread store', () => {
  beforeEach(() => {
    useUnread.setState({ counts: {} })
  })

  it('bump increments count for chat', () => {
    useUnread.getState().bump('chat-1')
    expect(useUnread.getState().counts['chat-1']).toBe(1)

    useUnread.getState().bump('chat-1')
    expect(useUnread.getState().counts['chat-1']).toBe(2)
  })

  it('clear removes count for chat', () => {
    useUnread.getState().bump('chat-1')
    useUnread.getState().clear('chat-1')

    expect(useUnread.getState().counts['chat-1']).toBeUndefined()
  })

  it('double-clear is safe', () => {
    useUnread.getState().clear('nonexistent')
    expect(useUnread.getState().counts).toEqual({})
  })
})
