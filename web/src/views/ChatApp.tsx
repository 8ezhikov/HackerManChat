import {
  useState, useEffect, useRef, useCallback, type KeyboardEvent,
} from 'react'
import { roomsApi, dmsApi, friendsApi, authApi } from '../lib/api'
import { connectHubs, disconnectHubs, handlers, chat } from '../lib/hubs'
import { useAuth } from '../store/auth'
import { usePresence } from '../store/presence'
import type { ActiveChat, Dm, Friend, Message, Room, RoomMember } from '../lib/types'

// ── Presence dot ──────────────────────────────────────────────────────────────
function PresenceDot({ userId }: { userId: string }) {
  const status = usePresence((s) => s.presences[userId] ?? 'offline')
  const color = status === 'online' ? 'bg-green-400' : status === 'afk' ? 'bg-yellow-400' : 'bg-gray-600'
  return <span className={`inline-block w-2 h-2 rounded-full ${color} flex-shrink-0`} title={status} />
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({
  myRooms, dms, friends,
  active, onSelect, onOpenDm, onBrowse,
}: {
  myRooms: Room[]
  dms: Dm[]
  friends: Friend[]
  active: ActiveChat | null
  onSelect: (c: ActiveChat) => void
  onOpenDm: (userId: string) => void
  onBrowse: () => void
}) {
  const { user, logout } = useAuth()

  const isActive = (c: ActiveChat) =>
    active?.type === c.type && active?.id === c.id

  return (
    <div className="w-60 bg-gray-900 flex flex-col shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <span className="font-bold text-white text-sm">HackerManChat</span>
        <button onClick={logout} className="text-gray-500 hover:text-gray-300 text-xs">out</button>
      </div>

      {/* Rooms */}
      <Section label="Rooms" action={{ label: 'Browse', onClick: onBrowse }}>
        {myRooms.map((r) => (
          <NavItem
            key={r.id}
            label={`# ${r.name}`}
            active={isActive({ type: 'room', id: r.id, name: r.name })}
            onClick={() => onSelect({ type: 'room', id: r.id, name: r.name })}
          />
        ))}
      </Section>

      {/* DMs */}
      <Section label="Direct Messages">
        {dms.map((dm) => (
          <NavItem
            key={dm.id}
            label={dm.otherDisplayName}
            active={isActive({ type: 'dm', id: dm.id, otherUsername: dm.otherUsername })}
            onClick={() => onSelect({ type: 'dm', id: dm.id, otherUsername: dm.otherUsername })}
            right={<PresenceDot userId={dm.otherUserId} />}
          />
        ))}
      </Section>

      {/* Friends */}
      <Section label="Friends">
        {friends.map((f) => (
          <NavItem
            key={f.userId}
            label={f.displayName}
            active={false}
            onClick={() => onOpenDm(f.userId)}
            right={<PresenceDot userId={f.userId} />}
          />
        ))}
      </Section>

      {/* Me */}
      <div className="mt-auto p-3 bg-gray-950 text-xs text-gray-400 flex items-center gap-2">
        <PresenceDot userId={user!.id} />
        <span className="truncate">{user!.username}</span>
      </div>
    </div>
  )
}

function Section({
  label, action, children,
}: {
  label: string
  action?: { label: string; onClick: () => void }
  children: React.ReactNode
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between px-4 mb-1">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
        {action && (
          <button onClick={action.onClick} className="text-gray-500 hover:text-gray-300 text-xs">
            {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function NavItem({
  label, active, onClick, right,
}: {
  label: string; active: boolean; onClick: () => void; right?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-4 py-1.5 text-sm text-left transition-colors
        ${active ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
    >
      <span className="truncate flex-1">{label}</span>
      {right}
    </button>
  )
}

// ── Message list ──────────────────────────────────────────────────────────────
function MessageItem({
  msg, isMe, onEdit, onDelete,
}: {
  msg: Message
  isMe: boolean
  onEdit: (id: string, content: string) => void
  onDelete: (id: string) => void
}) {
  const [hover, setHover] = useState(false)
  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div
      className="group flex items-start gap-3 px-4 py-1 hover:bg-gray-800/40 rounded"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="w-8 h-8 rounded-full bg-indigo-700 flex items-center justify-center text-xs text-white font-bold shrink-0 mt-0.5">
        {msg.authorUsername[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-gray-200">{msg.authorUsername}</span>
          <span className="text-xs text-gray-600">{time}</span>
          {msg.editedAt && <span className="text-xs text-gray-600">(edited)</span>}
        </div>
        <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{msg.content}</p>
      </div>
      {isMe && hover && (
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onEdit(msg.id, msg.content)}
            className="text-xs text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-700"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(msg.id)}
            className="text-xs text-gray-500 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-gray-700"
          >
            Del
          </button>
        </div>
      )}
    </div>
  )
}

// ── Chat area ─────────────────────────────────────────────────────────────────
function ChatArea({
  chat: activeChat, userId,
}: {
  chat: ActiveChat
  userId: string
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [members, setMembers] = useState<RoomMember[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const chatIdRef = useRef(activeChat.id)

  const isRoom = activeChat.type === 'room'

  // Load history when chat changes
  useEffect(() => {
    chatIdRef.current = activeChat.id
    setMessages([])
    setInput('')
    if (isRoom) chat.joinRoom(activeChat.id)
    const loader = isRoom
      ? roomsApi.getMessages(activeChat.id)
      : dmsApi.getMessages(activeChat.id)
    loader.then((msgs) => {
      if (chatIdRef.current !== activeChat.id) return
      setMessages([...msgs].reverse())
    }).catch(console.error)

    if (isRoom) {
      roomsApi.getMembers(activeChat.id).then(setMembers).catch(() => {})
    }
  }, [activeChat.id, isRoom])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Wire SignalR handlers to this chat
  useEffect(() => {
    const prev = {
      onRoomMessage: handlers.onRoomMessage,
      onDmMessage: handlers.onDmMessage,
      onRoomMessageEdited: handlers.onRoomMessageEdited,
      onDmMessageEdited: handlers.onDmMessageEdited,
      onRoomMessageDeleted: handlers.onRoomMessageDeleted,
      onDmMessageDeleted: handlers.onDmMessageDeleted,
    }

    handlers.onRoomMessage = (roomId, msg) => {
      if (roomId === activeChat.id) setMessages((m) => [...m, msg])
    }
    handlers.onDmMessage = (chatId, msg) => {
      if (chatId === activeChat.id) setMessages((m) => [...m, msg])
    }
    handlers.onRoomMessageEdited = (roomId, msg) => {
      if (roomId === activeChat.id)
        setMessages((m) => m.map((x) => x.id === msg.id ? msg : x))
    }
    handlers.onDmMessageEdited = (chatId, msg) => {
      if (chatId === activeChat.id)
        setMessages((m) => m.map((x) => x.id === msg.id ? msg : x))
    }
    handlers.onRoomMessageDeleted = (roomId, msgId) => {
      if (roomId === activeChat.id)
        setMessages((m) => m.filter((x) => x.id !== msgId))
    }
    handlers.onDmMessageDeleted = (chatId, msgId) => {
      if (chatId === activeChat.id)
        setMessages((m) => m.filter((x) => x.id !== msgId))
    }

    return () => { Object.assign(handlers, prev) }
  }, [activeChat.id])

  async function send() {
    const content = input.trim()
    if (!content) return
    setInput('')
    try {
      if (isRoom) await chat.sendRoom(activeChat.id, content)
      else await chat.sendDm(activeChat.id, content)
    } catch (err) {
      console.error('Send failed:', err)
      setInput(content)
    }
  }

  async function saveEdit() {
    if (!editingId) return
    const content = editContent.trim()
    if (!content) return
    try {
      if (isRoom) await chat.editRoom(activeChat.id, editingId, content)
      else await chat.editDm(activeChat.id, editingId, content)
      setEditingId(null)
    } catch (err) {
      console.error('Edit failed:', err)
    }
  }

  async function deleteMsg(msgId: string) {
    try {
      if (isRoom) await chat.deleteRoom(activeChat.id, msgId)
      else await chat.deleteDm(activeChat.id, msgId)
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const title = activeChat.type === 'room' ? `# ${activeChat.name}` : `@ ${activeChat.otherUsername}`

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Messages + input */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="h-12 border-b border-gray-800 flex items-center px-4 shrink-0">
          <span className="font-semibold text-white">{title}</span>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto py-4 space-y-0.5">
          {messages.map((msg) => (
            <MessageItem
              key={msg.id}
              msg={msg}
              isMe={msg.authorId === userId}
              onEdit={(id, content) => { setEditingId(id); setEditContent(content) }}
              onDelete={deleteMsg}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Edit bar */}
        {editingId && (
          <div className="mx-4 mb-2 p-2 bg-gray-800 rounded-lg flex gap-2">
            <input
              autoFocus
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
              className="flex-1 bg-transparent text-white text-sm outline-none"
            />
            <button onClick={saveEdit} className="text-indigo-400 text-xs hover:text-indigo-300">Save</button>
            <button onClick={() => setEditingId(null)} className="text-gray-500 text-xs hover:text-gray-300">Cancel</button>
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-4 shrink-0">
          <div className="bg-gray-800 rounded-xl flex items-end gap-2 px-4 py-2">
            <textarea
              rows={1}
              placeholder={`Message ${title}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              className="flex-1 bg-transparent text-white text-sm resize-none outline-none placeholder-gray-500 max-h-32"
            />
            <button
              onClick={send}
              disabled={!input.trim()}
              className="text-indigo-400 hover:text-indigo-300 disabled:text-gray-600 text-sm pb-0.5"
            >
              ↑
            </button>
          </div>
        </div>
      </div>

      {/* Room members panel */}
      {isRoom && (
        <div className="w-48 bg-gray-900 border-l border-gray-800 overflow-y-auto p-4 shrink-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Members — {members.length}</p>
          {members.map((m) => (
            <div key={m.userId} className="flex items-center gap-2 py-1">
              <PresenceDot userId={m.userId} />
              <span className="text-sm text-gray-300 truncate">{m.displayName}</span>
              {m.role === 'admin' && <span className="text-xs text-indigo-400">admin</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Room browser modal ────────────────────────────────────────────────────────
function RoomBrowser({
  onJoin, onClose,
}: {
  onJoin: (room: Room) => void
  onClose: () => void
}) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newVis, setNewVis] = useState<'public' | 'private'>('public')

  useEffect(() => {
    roomsApi.list().then(setRooms).catch(console.error)
  }, [])

  async function join(room: Room) {
    try {
      await roomsApi.join(room.id)
      onJoin(room)
    } catch (err) {
      console.error(err)
    }
  }

  async function create() {
    if (!newName.trim()) return
    try {
      const room = await roomsApi.create(newName.trim(), newDesc, newVis)
      onJoin(room)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold">Browse Rooms</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">✕</button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
          {rooms.length === 0 && <p className="text-gray-500 text-sm text-center py-4">No public rooms yet.</p>}
          {rooms.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
              <div>
                <p className="text-white text-sm font-medium"># {r.name}</p>
                {r.description && <p className="text-gray-400 text-xs">{r.description}</p>}
              </div>
              <button
                onClick={() => join(r)}
                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-lg"
              >
                Join
              </button>
            </div>
          ))}
        </div>

        {!creating ? (
          <button onClick={() => setCreating(true)} className="text-indigo-400 hover:text-indigo-300 text-sm">
            + Create room
          </button>
        ) : (
          <div className="space-y-2">
            <input
              autoFocus
              placeholder="Room name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={newVis}
              onChange={(e) => setNewVis(e.target.value as 'public' | 'private')}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
            <div className="flex gap-2">
              <button onClick={create} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg py-2">Create</button>
              <button onClick={() => setCreating(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg py-2">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Root chat app ─────────────────────────────────────────────────────────────
export default function ChatApp() {
  const { user } = useAuth()
  const { setPresence, setAll } = usePresence()
  const [myRooms, setMyRooms] = useState<Room[]>([])
  const [dms, setDms] = useState<Dm[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [active, setActive] = useState<ActiveChat | null>(null)
  const [browsing, setBrowsing] = useState(false)

  // Wire presence callbacks
  handlers.onPresenceChanged = useCallback((userId: string, status) => {
    setPresence(userId, status)
  }, [setPresence])

  // Connect hubs once on mount
  useEffect(() => {
    connectHubs((presences) => setAll(presences)).catch(console.error)
    return () => { disconnectHubs().catch(console.error) }
  }, [setAll])

  // Load sidebar data
  useEffect(() => {
    const load = async () => {
      const [rooms, allRooms, dmList, friendList] = await Promise.allSettled([
        Promise.resolve([] as Room[]), // placeholder for "my rooms"
        roomsApi.list(),
        dmsApi.list(),
        friendsApi.list(),
      ])
      // My rooms = all rooms where user is member (use the public list as proxy — TODO: add /api/rooms/mine)
      if (dmList.status === 'fulfilled') setDms(dmList.value)
      if (friendList.status === 'fulfilled') setFriends(friendList.value)
    }
    load()
    // Poll sidebar every 30s for new DMs/friends
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])

  // Load joined rooms (use members endpoint per-room is expensive, so just show rooms the user has navigated to)
  // Better: server should expose GET /api/rooms/mine — for now, track locally
  const addRoom = useCallback((room: Room) => {
    setMyRooms((r) => r.some((x) => x.id === room.id) ? r : [...r, room])
    setActive({ type: 'room', id: room.id, name: room.name })
    setBrowsing(false)
  }, [])

  async function openDm(userId: string) {
    try {
      const dm = await dmsApi.open(userId)
      setDms((d) => d.some((x) => x.id === dm.id) ? d : [dm, ...d])
      setActive({ type: 'dm', id: dm.id, otherUsername: dm.otherUsername })
    } catch (err) {
      console.error('Could not open DM:', err)
    }
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <Sidebar
        myRooms={myRooms}
        dms={dms}
        friends={friends}
        active={active}
        onSelect={setActive}
        onOpenDm={openDm}
        onBrowse={() => setBrowsing(true)}
      />

      <main className="flex flex-1 overflow-hidden">
        {active ? (
          <ChatArea chat={active} userId={user!.id} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-600">
              <p className="text-lg font-semibold">Welcome to HackerManChat</p>
              <p className="text-sm mt-1">Select a room or DM to start chatting</p>
              <button
                onClick={() => setBrowsing(true)}
                className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg"
              >
                Browse rooms
              </button>
            </div>
          </div>
        )}
      </main>

      {browsing && <RoomBrowser onJoin={addRoom} onClose={() => setBrowsing(false)} />}
    </div>
  )
}
