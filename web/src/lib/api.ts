import type { AuthResponse, Dm, Friend, FriendRequest, Message, Room, RoomBan, RoomMember, SessionDto, UserSearchResult } from './types'

export async function uploadFile(path: string, file: File, content?: string): Promise<Message> {
  const form = new FormData()
  form.append('file', file)
  if (content?.trim()) form.append('content', content.trim())

  const headers = new Headers()
  if (_access) headers.set('Authorization', `Bearer ${_access}`)

  const res = await fetch(`/api${path}`, { method: 'POST', headers, body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? res.statusText)
  }
  return res.json()
}

// ── Token state (module-level, not persisted) ─────────────────────────────────
let _access: string | null = null
let _refresh: string | null = localStorage.getItem('hmc_refresh')
let _onLogout: (() => void) | null = null

export const setTokens = (access: string, refresh: string) => {
  _access = access
  _refresh = refresh
  localStorage.setItem('hmc_refresh', refresh)
}

export const clearTokens = () => {
  _access = null
  _refresh = null
  localStorage.removeItem('hmc_refresh')
}

export const getAccessToken = () => _access
export const hasRefreshToken = () => !!_refresh
export const onLogout = (fn: () => void) => { _onLogout = fn }

let _refreshing: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (!_refresh) return false
  if (_refreshing) return _refreshing

  _refreshing = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: _refresh }),
      })
      if (!res.ok) { clearTokens(); _onLogout?.(); return false }
      const data: AuthResponse = await res.json()
      setTokens(data.accessToken, data.refreshToken)
      return true
    } finally {
      _refreshing = null
    }
  })()

  return _refreshing
}

async function req<T = void>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers as HeadersInit)
  headers.set('Content-Type', 'application/json')
  if (_access) headers.set('Authorization', `Bearer ${_access}`)

  let res = await fetch(`/api${path}`, { ...init, headers })

  if (res.status === 401) {
    const ok = await tryRefresh()
    if (ok) {
      headers.set('Authorization', `Bearer ${_access}`)
      res = await fetch(`/api${path}`, { ...init, headers })
    }
  }

  if (res.status === 204) return undefined as T
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    const msg = body.error ?? (Array.isArray(body.errors) ? body.errors.join('\n') : null) ?? res.statusText
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

const json = (body: unknown) => ({ body: JSON.stringify(body) })

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (email: string, username: string, password: string) =>
    req<AuthResponse>('/auth/register', { method: 'POST', ...json({ email, username, password }) }),

  login: (email: string, password: string) =>
    req<AuthResponse>('/auth/login', { method: 'POST', ...json({ email, password }) }),

  logout: (refreshToken: string) =>
    req('/auth/logout', { method: 'POST', ...json({ refreshToken }) }),

  getSessions: () => req<SessionDto[]>('/auth/sessions'),
  revokeSession: (id: string) => req(`/auth/sessions/${id}`, { method: 'DELETE' }),
  deleteAccount: () => req('/auth/account', { method: 'DELETE' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    req('/auth/password/change', { method: 'POST', ...json({ currentPassword, newPassword }) }),

  requestPasswordReset: (email: string) =>
    req('/auth/password/reset-request', { method: 'POST', ...json({ email }) }),

  resetPassword: (email: string, token: string, newPassword: string) =>
    req('/auth/password/reset', { method: 'POST', ...json({ email, token, newPassword }) }),

  refreshSession: async (): Promise<AuthResponse | null> => {
    if (!_refresh) return null
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: _refresh }),
    })
    if (!res.ok) { clearTokens(); return null }
    return res.json()
  },
}

// ── Rooms ─────────────────────────────────────────────────────────────────────
export const roomsApi = {
  list: (page = 1, search?: string) => req<Room[]>(`/rooms?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  mine: () => req<Room[]>('/rooms/mine'),
  get: (id: string) => req<Room>(`/rooms/${id}`),
  create: (name: string, description: string, visibility: 'public' | 'private') =>
    req<Room>('/rooms', { method: 'POST', ...json({ name, description, visibility }) }),
  join: (id: string) => req(`/rooms/${id}/join`, { method: 'POST' }),
  leave: (id: string) => req(`/rooms/${id}/leave`, { method: 'DELETE' }),
  getMembers: (id: string) => req<RoomMember[]>(`/rooms/${id}/members`),
  delete: (id: string) => req(`/rooms/${id}`, { method: 'DELETE' }),
  getMessages: (id: string, before?: string, beforeId?: string) => {
    const params = new URLSearchParams({ limit: '50' })
    if (before) params.set('before', before)
    if (beforeId) params.set('beforeId', beforeId)
    return req<Message[]>(`/rooms/${id}/messages?${params}`)
  },
  kick: (roomId: string, userId: string) =>
    req(`/rooms/${roomId}/members/${userId}`, { method: 'DELETE' }),
  ban: (roomId: string, userId: string) =>
    req(`/rooms/${roomId}/bans/${userId}`, { method: 'POST' }),
  unban: (roomId: string, userId: string) =>
    req(`/rooms/${roomId}/bans/${userId}`, { method: 'DELETE' }),
  getBans: (roomId: string) => req<RoomBan[]>(`/rooms/${roomId}/bans`),
  promoteAdmin: (roomId: string, userId: string) =>
    req(`/rooms/${roomId}/admins/${userId}`, { method: 'POST' }),
  demoteAdmin: (roomId: string, userId: string) =>
    req(`/rooms/${roomId}/admins/${userId}`, { method: 'DELETE' }),
  update: (id: string, patch: { name?: string; description?: string; visibility?: string }) =>
    req<Room>(`/rooms/${id}`, { method: 'PATCH', ...json(patch) }),
  invite: (roomId: string, userId: string) =>
    req(`/rooms/${roomId}/invites`, { method: 'POST', ...json({ userId }) }),
}

// ── DMs ───────────────────────────────────────────────────────────────────────
export const dmsApi = {
  list: () => req<Dm[]>('/dms'),
  open: (userId: string) => req<Dm>('/dms', { method: 'POST', ...json({ userId }) }),
  getMessages: (id: string, before?: string, beforeId?: string) => {
    const params = new URLSearchParams({ limit: '50' })
    if (before) params.set('before', before)
    if (beforeId) params.set('beforeId', beforeId)
    return req<Message[]>(`/dms/${id}/messages?${params}`)
  },
}

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersApi = {
  search: (username: string) => req<UserSearchResult[]>(`/users/search?username=${encodeURIComponent(username)}`),
}

// ── Friends ───────────────────────────────────────────────────────────────────
export const friendsApi = {
  list: () => req<Friend[]>('/friends'),
  requests: () => req<FriendRequest[]>('/friends/requests'),
  send: (userId: string) => req('/friends/requests', { method: 'POST', ...json({ userId }) }),
  accept: (requesterId: string) => req(`/friends/requests/${requesterId}/accept`, { method: 'POST' }),
  decline: (requesterId: string) => req(`/friends/requests/${requesterId}`, { method: 'DELETE' }),
  unfriend: (userId: string) => req(`/friends/${userId}`, { method: 'DELETE' }),
}
