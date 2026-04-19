import { http, HttpResponse } from 'msw'
import type { AuthResponse, Room, Message, Friend, FriendRequest, Dm, SessionDto, RoomMember } from '../../lib/types'

const mockUser = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  username: 'testuser',
  email: 'test@example.com',
  displayName: 'Test User',
}

const mockAuth: AuthResponse = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  refreshExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  user: mockUser,
}

const mockRoom: Room = {
  id: '223e4567-e89b-12d3-a456-426614174000',
  name: 'test-room',
  description: 'A test room',
  visibility: 'public',
  ownerId: mockUser.id,
  createdAt: new Date().toISOString(),
  memberCount: 5,
}

const mockMessage: Message = {
  id: '323e4567-e89b-12d3-a456-426614174000',
  authorId: mockUser.id,
  authorUsername: mockUser.username,
  content: 'Hello, world!',
  createdAt: new Date().toISOString(),
  isDeleted: false,
  attachments: [],
}

const mockDm: Dm = {
  id: '423e4567-e89b-12d3-a456-426614174000',
  otherUserId: '523e4567-e89b-12d3-a456-426614174000',
  otherUsername: 'otheruser',
  otherDisplayName: 'Other User',
  isFrozen: false,
  createdAt: new Date().toISOString(),
}

const mockSession: SessionDto = {
  id: '623e4567-e89b-12d3-a456-426614174000',
  deviceInfo: 'Chrome on macOS',
  ipAddress: '192.168.1.1',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
}

export const handlers = [
  http.post('/api/auth/register', () =>
    HttpResponse.json(mockAuth),
  ),
  http.post('/api/auth/login', () =>
    HttpResponse.json(mockAuth),
  ),
  http.post('/api/auth/logout', () =>
    HttpResponse.json(undefined, { status: 204 }),
  ),
  http.post('/api/auth/refresh', () =>
    HttpResponse.json(mockAuth),
  ),
  http.get('/api/auth/sessions', () =>
    HttpResponse.json([mockSession]),
  ),
  http.delete('/api/auth/sessions/:id', () =>
    HttpResponse.json(undefined, { status: 204 }),
  ),
  http.delete('/api/auth/account', () =>
    HttpResponse.json(undefined, { status: 204 }),
  ),

  http.get('/api/rooms', () =>
    HttpResponse.json([mockRoom]),
  ),
  http.get('/api/rooms/mine', () =>
    HttpResponse.json([mockRoom]),
  ),
  http.get('/api/rooms/:id', () =>
    HttpResponse.json(mockRoom),
  ),
  http.post('/api/rooms', () =>
    HttpResponse.json(mockRoom, { status: 201 }),
  ),
  http.post('/api/rooms/:id/join', () =>
    HttpResponse.json(undefined, { status: 204 }),
  ),
  http.delete('/api/rooms/:id/leave', () =>
    HttpResponse.json(undefined, { status: 204 }),
  ),
  http.delete('/api/rooms/:id', () =>
    HttpResponse.json(undefined, { status: 204 }),
  ),
  http.get('/api/rooms/:id/members', () =>
    HttpResponse.json([
      { userId: mockUser.id, username: mockUser.username, displayName: mockUser.displayName, role: 'owner', joinedAt: new Date().toISOString() },
    ]),
  ),

  http.get('/api/rooms/:roomId/messages', () =>
    HttpResponse.json([mockMessage]),
  ),
  http.post('/api/rooms/:roomId/messages', () =>
    HttpResponse.json(mockMessage, { status: 201 }),
  ),
  http.patch('/api/rooms/:roomId/messages/:msgId', () =>
    HttpResponse.json(mockMessage),
  ),
  http.delete('/api/rooms/:roomId/messages/:msgId', () =>
    HttpResponse.json(undefined, { status: 204 }),
  ),

  http.get('/api/dms', () =>
    HttpResponse.json([mockDm]),
  ),
  http.post('/api/dms', () =>
    HttpResponse.json(mockDm),
  ),
  http.get('/api/dms/:id/messages', () =>
    HttpResponse.json([mockMessage]),
  ),
  http.post('/api/dms/:id/messages', () =>
    HttpResponse.json(mockMessage, { status: 201 }),
  ),

  http.get('/api/friends', () =>
    HttpResponse.json([]),
  ),
  http.get('/api/friends/requests', () =>
    HttpResponse.json([]),
  ),
  http.post('/api/friends/requests', () =>
    HttpResponse.json(undefined, { status: 204 }),
  ),
  http.post('/api/friends/requests/:id/accept', () =>
    HttpResponse.json(undefined, { status: 204 }),
  ),
  http.delete('/api/friends/requests/:id', () =>
    HttpResponse.json(undefined, { status: 204 }),
  ),

  http.post('/api/users/bans/:id', () =>
    HttpResponse.json(undefined, { status: 204 }),
  ),
  http.get('/api/users/bans', () =>
    HttpResponse.json([]),
  ),
]
