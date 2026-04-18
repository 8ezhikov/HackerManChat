import * as signalR from '@microsoft/signalr'
import type { Message, Presence } from './types'
import { getAccessToken } from './api'

// ── Hub instances ─────────────────────────────────────────────────────────────
let chatHub: signalR.HubConnection | null = null
let presenceHub: signalR.HubConnection | null = null

// ── Event callbacks (set by the app) ─────────────────────────────────────────
export const handlers = {
  onRoomMessage: (_roomId: string, _msg: Message) => {},
  onDmMessage: (_chatId: string, _msg: Message) => {},
  onRoomMessageEdited: (_roomId: string, _msg: Message) => {},
  onDmMessageEdited: (_chatId: string, _msg: Message) => {},
  onRoomMessageDeleted: (_roomId: string, _msgId: string) => {},
  onDmMessageDeleted: (_chatId: string, _msgId: string) => {},
  onPresenceChanged: (_userId: string, _status: Presence) => {},
}

// ── BroadcastChannel cross-tab sync ──────────────────────────────────────────
const bc = new BroadcastChannel('hmc-sync')

bc.onmessage = (e) => {
  const { type, ...d } = e.data
  if (type === 'RoomMessageReceived') handlers.onRoomMessage(d.roomId, d.msg)
  else if (type === 'DmMessageReceived') handlers.onDmMessage(d.chatId, d.msg)
  else if (type === 'RoomMessageEdited') handlers.onRoomMessageEdited(d.roomId, d.msg)
  else if (type === 'DmMessageEdited') handlers.onDmMessageEdited(d.chatId, d.msg)
  else if (type === 'RoomMessageDeleted') handlers.onRoomMessageDeleted(d.roomId, d.msgId)
  else if (type === 'DmMessageDeleted') handlers.onDmMessageDeleted(d.chatId, d.msgId)
  else if (type === 'PresenceChanged') handlers.onPresenceChanged(d.userId, d.status)
}

function broadcast(payload: Record<string, unknown>) {
  try { bc.postMessage(payload) } catch { /* tab closing */ }
}

// ── Connect ───────────────────────────────────────────────────────────────────
export async function connectHubs(
  onFriendPresences: (p: Record<string, Presence>) => void,
) {
  chatHub = new signalR.HubConnectionBuilder()
    .withUrl('/hubs/chat', { accessTokenFactory: () => getAccessToken() ?? '' })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Warning)
    .build()

  presenceHub = new signalR.HubConnectionBuilder()
    .withUrl('/hubs/presence', { accessTokenFactory: () => getAccessToken() ?? '' })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Warning)
    .build()

  chatHub.on('RoomMessageReceived', (roomId: string, msg: Message) => {
    handlers.onRoomMessage(roomId, msg)
    broadcast({ type: 'RoomMessageReceived', roomId, msg })
  })
  chatHub.on('DmMessageReceived', (chatId: string, msg: Message) => {
    handlers.onDmMessage(chatId, msg)
    broadcast({ type: 'DmMessageReceived', chatId, msg })
  })
  chatHub.on('RoomMessageEdited', (roomId: string, msg: Message) => {
    handlers.onRoomMessageEdited(roomId, msg)
    broadcast({ type: 'RoomMessageEdited', roomId, msg })
  })
  chatHub.on('DmMessageEdited', (chatId: string, msg: Message) => {
    handlers.onDmMessageEdited(chatId, msg)
    broadcast({ type: 'DmMessageEdited', chatId, msg })
  })
  chatHub.on('RoomMessageDeleted', (roomId: string, msgId: string) => {
    handlers.onRoomMessageDeleted(roomId, msgId)
    broadcast({ type: 'RoomMessageDeleted', roomId, msgId })
  })
  chatHub.on('DmMessageDeleted', (chatId: string, msgId: string) => {
    handlers.onDmMessageDeleted(chatId, msgId)
    broadcast({ type: 'DmMessageDeleted', chatId, msgId })
  })

  presenceHub.on('PresenceChanged', (userId: string, status: Presence) => {
    handlers.onPresenceChanged(userId, status)
    broadcast({ type: 'PresenceChanged', userId, status })
  })

  await chatHub.start()
  await presenceHub.start()

  // Bootstrap friend presences
  const presences = await presenceHub.invoke<Record<string, Presence>>('GetFriendPresences')
  onFriendPresences(presences)

  // AFK detection: track last user-activity timestamp
  const AFK_MS = 60_000
  let lastActivity = Date.now()
  const onActivity = () => { lastActivity = Date.now() }
  window.addEventListener('mousemove', onActivity, { passive: true })
  window.addEventListener('keydown', onActivity, { passive: true })
  window.addEventListener('click', onActivity, { passive: true })
  window.addEventListener('scroll', onActivity, { passive: true })

  // Send heartbeat every 30 s; isActive = tab visible AND active within last 60 s
  setInterval(() => {
    if (presenceHub?.state === signalR.HubConnectionState.Connected) {
      const isActive = !document.hidden && (Date.now() - lastActivity) < AFK_MS
      presenceHub.invoke('Heartbeat', isActive).catch(() => {})
    }
  }, 30_000)
}

export async function disconnectHubs() {
  await chatHub?.stop()
  await presenceHub?.stop()
  chatHub = null
  presenceHub = null
}

// ── Chat hub methods ──────────────────────────────────────────────────────────
export const chat = {
  joinRoom: (roomId: string) =>
    chatHub?.invoke('JoinRoomGroup', roomId).catch(console.error),
  sendRoom: (roomId: string, content: string, replyToId?: string) =>
    chatHub!.invoke('SendRoomMessage', roomId, content, replyToId ?? null),
  sendDm: (chatId: string, content: string, replyToId?: string) =>
    chatHub!.invoke('SendDmMessage', chatId, content, replyToId ?? null),
  editRoom: (roomId: string, msgId: string, content: string) =>
    chatHub!.invoke('EditRoomMessage', roomId, msgId, content),
  editDm: (chatId: string, msgId: string, content: string) =>
    chatHub!.invoke('EditDmMessage', chatId, msgId, content),
  deleteRoom: (roomId: string, msgId: string) =>
    chatHub!.invoke('DeleteRoomMessage', roomId, msgId),
  deleteDm: (chatId: string, msgId: string) =>
    chatHub!.invoke('DeleteDmMessage', chatId, msgId),
}
