export type User = { id: string; username: string; email: string; displayName: string }

export type AuthResponse = {
  accessToken: string
  refreshToken: string
  refreshExpiresAt: string
  user: User
}

export type Room = {
  id: string; name: string; description?: string
  visibility: string; ownerId: string; createdAt: string
}

export type RoomMember = {
  userId: string; username: string; displayName: string
  role: string; joinedAt: string
}

export type Dm = {
  id: string; otherUserId: string; otherUsername: string
  otherDisplayName: string; isFrozen: boolean; createdAt: string
}

export type Message = {
  id: string; authorId: string; authorUsername: string
  content: string; createdAt: string; editedAt?: string
  isDeleted: boolean; replyToId?: string
}

export type Friend = {
  userId: string; username: string; displayName: string; friendsSince: string
}

export type FriendRequest = {
  userId: string; username: string; displayName: string; sentAt: string
}

export type Presence = 'online' | 'afk' | 'offline'

export type ActiveChat =
  | { type: 'room'; id: string; name: string }
  | { type: 'dm'; id: string; otherUsername: string }
