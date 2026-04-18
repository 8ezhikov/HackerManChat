import { create } from 'zustand'
import type { Presence } from '../lib/types'

type PresenceStore = {
  presences: Record<string, Presence>
  setPresence: (userId: string, status: Presence) => void
  setAll: (p: Record<string, Presence>) => void
}

export const usePresence = create<PresenceStore>((set) => ({
  presences: {},
  setPresence: (userId, status) =>
    set((s) => ({ presences: { ...s.presences, [userId]: status } })),
  setAll: (p) => set({ presences: p }),
}))
