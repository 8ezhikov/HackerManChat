import * as signalR from '@microsoft/signalr'
import type { Message, Presence } from './types'
import { getAccessToken, roomsApi, dmsApi } from './api'

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

// ── Tab leader election ───────────────────────────────────────────────────────
// Only the leader tab holds SignalR connections. Followers receive real-time
// events via BroadcastChannel and use REST endpoints for sends.

const TAB_ID = crypto.randomUUID()
const LEADER_KEY = 'hmc-leader'
const LEADER_TS_KEY = 'hmc-leader-ts'
const LEADER_TTL = 4_000        // leader considered dead after 4 s without refresh
const LEADER_REFRESH_MS = 1_500 // leader refreshes its timestamp every 1.5 s
const FOLLOWER_POLL_MS = 2_000  // followers poll for a dead leader every 2 s

let isLeader = false
let leaderRefreshTimer: ReturnType<typeof setInterval> | null = null
let followerPollTimer: ReturnType<typeof setInterval> | null = null

let cachedPresences: Record<string, Presence> = {}
let storedPresenceCb: ((p: Record<string, Presence>) => void) | null = null
let pendingBootstrap: ((p: Record<string, Presence>) => void) | null = null

function tryClaimLeadership(): boolean {
  const storedId = localStorage.getItem(LEADER_KEY)
  const storedTs = Number(localStorage.getItem(LEADER_TS_KEY) ?? '0')
  if (storedId && storedId !== TAB_ID && Date.now() - storedTs < LEADER_TTL) {
    return false
  }
  localStorage.setItem(LEADER_KEY, TAB_ID)
  localStorage.setItem(LEADER_TS_KEY, String(Date.now()))
  return true
}

function resignLeadership() {
  if (!isLeader) return
  isLeader = false
  if (leaderRefreshTimer) { clearInterval(leaderRefreshTimer); leaderRefreshTimer = null }
  if (localStorage.getItem(LEADER_KEY) === TAB_ID) {
    localStorage.removeItem(LEADER_KEY)
    localStorage.removeItem(LEADER_TS_KEY)
  }
}

window.addEventListener('beforeunload', () => { resignLeadership() })

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
  else if (type === 'PresenceChanged') {
    handlers.onPresenceChanged(d.userId, d.status as Presence)
    cachedPresences[d.userId] = d.status as Presence
  }
  // Leader sends full snapshot on connect; followers call it for initial bootstrap
  else if (type === 'PresenceBootstrap') {
    cachedPresences = d.presences as Record<string, Presence>
    if (pendingBootstrap) { pendingBootstrap(cachedPresences); pendingBootstrap = null }
  }
  // New follower tab requests the current presence snapshot from the leader
  else if (type === 'RequestPresenceBootstrap' && isLeader) {
    bc.postMessage({ type: 'PresenceBootstrap', presences: cachedPresences })
  }
  // Follower joined a room mid-session; relay to the leader's SignalR connection
  else if (type === 'JoinRoom' && isLeader) {
    chatHub?.invoke('JoinRoomGroup', d.roomId).catch(() => {})
  }
}

function broadcast(payload: Record<string, unknown>) {
  try { bc.postMessage(payload) } catch { /* tab closing */ }
}

// ── Leader path ───────────────────────────────────────────────────────────────
async function connectAsLeader(onFriendPresences: (p: Record<string, Presence>) => void) {
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
    cachedPresences[userId] = status
    broadcast({ type: 'PresenceChanged', userId, status })
  })

  await chatHub.start()
  await presenceHub.start()

  const presences = await presenceHub.invoke<Record<string, Presence>>('GetFriendPresences')
  cachedPresences = presences
  onFriendPresences(presences)
  broadcast({ type: 'PresenceBootstrap', presences })

  leaderRefreshTimer = setInterval(() => {
    localStorage.setItem(LEADER_TS_KEY, String(Date.now()))
  }, LEADER_REFRESH_MS)

  // AFK detection — only the leader sends presence heartbeats to the server
  const AFK_MS = 60_000
  let lastActivity = Date.now()
  const onActivity = () => { lastActivity = Date.now() }
  window.addEventListener('mousemove', onActivity, { passive: true })
  window.addEventListener('keydown', onActivity, { passive: true })
  window.addEventListener('click', onActivity, { passive: true })
  window.addEventListener('scroll', onActivity, { passive: true })

  setInterval(() => {
    if (presenceHub?.state === signalR.HubConnectionState.Connected) {
      const isActive = !document.hidden && (Date.now() - lastActivity) < AFK_MS
      presenceHub.invoke('Heartbeat', isActive).catch(() => {})
    }
  }, 30_000)
}

// ── Follower path ─────────────────────────────────────────────────────────────
function connectAsFollower(onFriendPresences: (p: Record<string, Presence>) => void) {
  pendingBootstrap = onFriendPresences
  broadcast({ type: 'RequestPresenceBootstrap' })

  // Fall back to cached presences if the leader doesn't respond within 500 ms
  setTimeout(() => {
    if (pendingBootstrap) { onFriendPresences(cachedPresences); pendingBootstrap = null }
  }, 500)

  followerPollTimer = setInterval(async () => {
    if (isLeader) { clearInterval(followerPollTimer!); followerPollTimer = null; return }
    if (tryClaimLeadership()) {
      isLeader = true
      clearInterval(followerPollTimer!); followerPollTimer = null
      if (storedPresenceCb) await connectAsLeader(storedPresenceCb)
    }
  }, FOLLOWER_POLL_MS)
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function connectHubs(onFriendPresences: (p: Record<string, Presence>) => void) {
  storedPresenceCb = onFriendPresences
  isLeader = tryClaimLeadership()

  if (isLeader) {
    await connectAsLeader(onFriendPresences)
  } else {
    connectAsFollower(onFriendPresences)
  }
}

export async function disconnectHubs() {
  resignLeadership()
  if (followerPollTimer) { clearInterval(followerPollTimer); followerPollTimer = null }
  await chatHub?.stop()
  await presenceHub?.stop()
  chatHub = null
  presenceHub = null
}

// ── Chat hub methods ──────────────────────────────────────────────────────────
// Leader uses SignalR invoke; followers fall back to REST. Either way the server
// broadcasts the resulting event back through SignalR → leader → BroadcastChannel.
export const chat = {
  joinRoom: (roomId: string) => {
    if (chatHub?.state === signalR.HubConnectionState.Connected)
      return chatHub.invoke('JoinRoomGroup', roomId).catch(() => {})
    broadcast({ type: 'JoinRoom', roomId })
  },

  sendRoom: (roomId: string, content: string, replyToId?: string) =>
    chatHub?.state === signalR.HubConnectionState.Connected
      ? chatHub.invoke('SendRoomMessage', roomId, content, replyToId ?? null)
      : roomsApi.sendMessage(roomId, content, replyToId),

  sendDm: (chatId: string, content: string, replyToId?: string) =>
    chatHub?.state === signalR.HubConnectionState.Connected
      ? chatHub.invoke('SendDmMessage', chatId, content, replyToId ?? null)
      : dmsApi.sendMessage(chatId, content, replyToId),

  editRoom: (roomId: string, msgId: string, content: string) =>
    chatHub?.state === signalR.HubConnectionState.Connected
      ? chatHub.invoke('EditRoomMessage', roomId, msgId, content)
      : roomsApi.editMessage(roomId, msgId, content),

  editDm: (chatId: string, msgId: string, content: string) =>
    chatHub?.state === signalR.HubConnectionState.Connected
      ? chatHub.invoke('EditDmMessage', chatId, msgId, content)
      : dmsApi.editMessage(chatId, msgId, content),

  deleteRoom: (roomId: string, msgId: string) =>
    chatHub?.state === signalR.HubConnectionState.Connected
      ? chatHub.invoke('DeleteRoomMessage', roomId, msgId)
      : roomsApi.deleteMessage(roomId, msgId),

  deleteDm: (chatId: string, msgId: string) =>
    chatHub?.state === signalR.HubConnectionState.Connected
      ? chatHub.invoke('DeleteDmMessage', chatId, msgId)
      : dmsApi.deleteMessage(chatId, msgId),
}
