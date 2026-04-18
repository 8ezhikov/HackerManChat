import { create } from 'zustand'

interface UnreadState {
  counts: Record<string, number>
  bump: (chatId: string) => void
  clear: (chatId: string) => void
}

export const useUnread = create<UnreadState>((set) => ({
  counts: {},
  bump: (chatId) => set((s) => ({ counts: { ...s.counts, [chatId]: (s.counts[chatId] ?? 0) + 1 } })),
  clear: (chatId) => set((s) => {
    if (!s.counts[chatId]) return s
    const counts = { ...s.counts }
    delete counts[chatId]
    return { counts }
  }),
}))
