import {
  useState, useEffect, useRef, useCallback, type KeyboardEvent,
} from 'react'
import { roomsApi, dmsApi, friendsApi, usersApi, authApi, uploadFile, getAccessToken } from '../lib/api'
import { connectHubs, disconnectHubs, handlers, chat } from '../lib/hubs'
import { useAuth } from '../store/auth'
import { usePresence } from '../store/presence'
import { useUnread } from '../store/unread'
import type { ActiveChat, AttachmentDto, Dm, Friend, FriendRequest, Message, Room, RoomBan, RoomMember, SessionDto, UserSearchResult } from '../lib/types'

// ── Presence dot ──────────────────────────────────────────────────────────────
function PresenceDot({ userId }: { userId: string }) {
  const status = usePresence((s) => s.presences[userId] ?? 'offline')
  const color = status === 'online' ? 'bg-green-400' : status === 'afk' ? 'bg-yellow-400' : 'bg-gray-600'
  return <span className={`inline-block w-2 h-2 rounded-full ${color} flex-shrink-0`} title={status} />
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({
  myRooms, dms, friends,
  active, onSelect, onOpenDm, onBrowse, onSettings, onAddFriend, unread,
}: {
  myRooms: Room[]
  dms: Dm[]
  friends: Friend[]
  active: ActiveChat | null
  onSelect: (c: ActiveChat) => void
  onOpenDm: (userId: string) => void
  onBrowse: () => void
  onSettings: () => void
  onAddFriend: () => void
  unread: Record<string, number>
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
            badge={unread[r.id]}
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
            badge={unread[dm.id]}
          />
        ))}
      </Section>

      {/* Friends */}
      <Section label="Friends" action={{ label: '+', onClick: onAddFriend }}>
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
        <span className="truncate flex-1">{user!.username}</span>
        <button onClick={onSettings} title="Settings" className="text-gray-600 hover:text-gray-300">⚙</button>
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
  label, active, onClick, right, badge,
}: {
  label: string; active: boolean; onClick: () => void; right?: React.ReactNode; badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-4 py-1.5 text-sm text-left transition-colors
        ${active ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
    >
      <span className="truncate flex-1">{label}</span>
      {badge ? (
        <span className="bg-indigo-600 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : right}
    </button>
  )
}

// ── Attachment display ────────────────────────────────────────────────────────
function AttachmentList({ attachments }: { attachments: AttachmentDto[] }) {
  if (!attachments.length) return null
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {attachments.map((a) => {
        const url = `/api/attachments/${a.id}?access_token=${getAccessToken() ?? ''}`
        const isImage = a.contentType.startsWith('image/')
        const kb = (a.sizeBytes / 1024).toFixed(0)
        if (isImage) {
          return (
            <a key={a.id} href={url} target="_blank" rel="noreferrer">
              <img
                src={url}
                alt={a.originalFileName}
                className="max-h-48 max-w-xs rounded-lg border border-gray-700 object-contain"
              />
            </a>
          )
        }
        return (
          <a
            key={a.id}
            href={url}
            download={a.originalFileName}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 border border-gray-700"
          >
            <span>📎</span>
            <span className="truncate max-w-xs">{a.originalFileName}</span>
            <span className="text-gray-500 text-xs shrink-0">{kb} KB</span>
          </a>
        )
      })}
    </div>
  )
}

// ── Message list ──────────────────────────────────────────────────────────────
function MessageItem({
  msg, isMe, onEdit, onDelete, onReply,
}: {
  msg: Message
  isMe: boolean
  onEdit: (id: string, content: string) => void
  onDelete: (id: string) => void
  onReply: (msg: Message) => void
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
        {msg.replyToId && (
          <div className="mb-1 flex items-center gap-1.5 border-l-2 border-gray-600 pl-2 text-xs text-gray-500">
            <span className="text-gray-400 font-medium">{msg.replyToAuthor ?? '…'}</span>
            <span className="truncate max-w-xs">{msg.replyToContent || '📎 attachment'}</span>
          </div>
        )}
        {msg.content && <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{msg.content}</p>}
        <AttachmentList attachments={msg.attachments ?? []} />
      </div>
      {hover && (
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onReply(msg)}
            className="text-xs text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-700"
          >
            ↩
          </button>
          {isMe && msg.content && (
            <button
              onClick={() => onEdit(msg.id, msg.content)}
              className="text-xs text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-700"
            >
              Edit
            </button>
          )}
          {isMe && (
            <button
              onClick={() => onDelete(msg.id)}
              className="text-xs text-gray-500 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-gray-700"
            >
              Del
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Manage room modal ─────────────────────────────────────────────────────────
function ManageRoomModal({
  room, myId, members, bans,
  onMembersChange, onBansChange, onRoomUpdated, onRoomDeleted, onClose,
}: {
  room: Room
  myId: string
  members: RoomMember[]
  bans: RoomBan[]
  onMembersChange: (m: RoomMember[]) => void
  onBansChange: (b: RoomBan[]) => void
  onRoomUpdated: (r: Room) => void
  onRoomDeleted: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'admins' | 'invites' | 'settings'>('admins')
  const isOwner = room.ownerId === myId
  const isAdmin = members.find((m) => m.userId === myId)?.role === 'admin'

  // Admins tab state
  async function toggleAdmin(member: RoomMember) {
    try {
      if (member.role === 'admin') {
        await roomsApi.demoteAdmin(room.id, member.userId)
        onMembersChange(members.map((m) => m.userId === member.userId ? { ...m, role: 'member' } : m))
      } else {
        await roomsApi.promoteAdmin(room.id, member.userId)
        onMembersChange(members.map((m) => m.userId === member.userId ? { ...m, role: 'admin' } : m))
      }
    } catch (err) { console.error(err) }
  }

  // Invites tab state
  const [inviteQuery, setInviteQuery] = useState('')
  const [inviteResults, setInviteResults] = useState<UserSearchResult[]>([])
  const [invited, setInvited] = useState<Set<string>>(new Set())

  async function searchInvite() {
    if (!inviteQuery.trim()) return
    try { setInviteResults(await usersApi.search(inviteQuery.trim())) }
    catch (err) { console.error(err) }
  }

  async function invite(userId: string) {
    try {
      await roomsApi.invite(room.id, userId)
      setInvited((s) => new Set(s).add(userId))
    } catch (err) { console.error(err) }
  }

  // Settings tab state
  const [name, setName] = useState(room.name)
  const [desc, setDesc] = useState(room.description ?? '')
  const [vis, setVis] = useState<'public' | 'private'>(room.visibility as 'public' | 'private')
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [delConfirm, setDelConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function saveSettings() {
    setSaving(true); setSaveErr('')
    try {
      const updated = await roomsApi.update(room.id, { name: name.trim(), description: desc, visibility: vis })
      onRoomUpdated(updated)
    } catch (err: unknown) {
      setSaveErr(err instanceof Error ? err.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  async function deleteRoom() {
    if (delConfirm !== room.name) return
    setDeleting(true)
    try { await roomsApi.delete(room.id); onRoomDeleted() }
    catch (err) { console.error(err); setDeleting(false) }
  }

  const Tab = ({ id, label }: { id: typeof tab; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors
        ${tab === id ? 'text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold">Manage # {room.name}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">✕</button>
        </div>

        <div className="flex gap-1 border-b border-gray-800">
          <Tab id="admins" label="Admins" />
          {(isAdmin || isOwner) && <Tab id="invites" label="Invitations" />}
          {isOwner && <Tab id="settings" label="Settings" />}
        </div>

        {/* Admins tab */}
        {tab === 'admins' && (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {members.filter((m) => m.role === 'admin').length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">No admins yet.</p>
            )}
            {members.filter((m) => m.role === 'admin').map((m) => (
              <div key={m.userId} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                <PresenceDot userId={m.userId} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{m.displayName}</p>
                  {m.userId === room.ownerId && <p className="text-yellow-500 text-xs">owner</p>}
                </div>
                {isOwner && m.userId !== myId && (
                  <button
                    onClick={() => toggleAdmin(m)}
                    className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded"
                  >
                    Demote
                  </button>
                )}
              </div>
            ))}
            {isOwner && (
              <div className="pt-2 border-t border-gray-800">
                <p className="text-xs text-gray-500 mb-2">Promote a member to admin:</p>
                {members.filter((m) => m.role !== 'admin').map((m) => (
                  <div key={m.userId} className="flex items-center gap-2 py-1">
                    <span className="text-sm text-gray-400 flex-1 truncate">{m.displayName}</span>
                    <button
                      onClick={() => toggleAdmin(m)}
                      className="text-xs bg-indigo-700 hover:bg-indigo-600 text-white px-2 py-1 rounded"
                    >
                      Promote
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Invitations tab */}
        {tab === 'invites' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                autoFocus
                placeholder="Search by username…"
                value={inviteQuery}
                onChange={(e) => setInviteQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchInvite()}
                className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={searchInvite}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg"
              >
                Search
              </button>
            </div>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {inviteResults.map((u) => {
                const alreadyMember = members.some((m) => m.userId === u.id)
                return (
                  <div key={u.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-white text-sm font-medium">{u.displayName}</p>
                      <p className="text-gray-500 text-xs">@{u.username}</p>
                    </div>
                    <button
                      onClick={() => invite(u.id)}
                      disabled={alreadyMember || invited.has(u.id)}
                      className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1 rounded-lg"
                    >
                      {alreadyMember ? 'Member' : invited.has(u.id) ? 'Invited' : 'Invite'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Settings tab */}
        {tab === 'settings' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Room Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</label>
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Optional"
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Visibility</label>
              <select
                value={vis}
                onChange={(e) => setVis(e.target.value as 'public' | 'private')}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
            {saveErr && <p className="text-red-400 text-xs">{saveErr}</p>}
            <button
              onClick={saveSettings}
              disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm py-2 rounded-lg"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>

            <div className="border-t border-gray-800 pt-4 space-y-2">
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wider">Danger Zone</p>
              <p className="text-sm text-gray-400">
                Type <span className="font-mono text-white">{room.name}</span> to confirm deletion.
              </p>
              <div className="flex gap-2">
                <input
                  value={delConfirm}
                  onChange={(e) => setDelConfirm(e.target.value)}
                  placeholder={room.name}
                  className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500 font-mono"
                />
                <button
                  onClick={deleteRoom}
                  disabled={delConfirm !== room.name || deleting}
                  className="bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg"
                >
                  {deleting ? '…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Member panel (with moderation) ───────────────────────────────────────────
function MemberPanel({
  roomId, members, bans, ownerId, myId, onMembersChange, onBansChange, onManage,
}: {
  roomId: string
  members: RoomMember[]
  bans: RoomBan[]
  ownerId: string | null
  myId: string
  onMembersChange: (m: RoomMember[]) => void
  onBansChange: (b: RoomBan[]) => void
  onManage: () => void
}) {
  const [tab, setTab] = useState<'members' | 'bans'>('members')
  const [hovered, setHovered] = useState<string | null>(null)

  const myRole = members.find((m) => m.userId === myId)?.role ?? 'member'
  const isAdmin = myRole === 'admin'

  async function kick(userId: string) {
    try {
      await roomsApi.kick(roomId, userId)
      onMembersChange(members.filter((m) => m.userId !== userId))
    } catch (err) { console.error(err) }
  }

  async function ban(member: RoomMember) {
    try {
      await roomsApi.ban(roomId, member.userId)
      onMembersChange(members.filter((m) => m.userId !== member.userId))
      onBansChange([...bans, { userId: member.userId, username: member.username, bannedById: myId, createdAt: new Date().toISOString() }])
    } catch (err) { console.error(err) }
  }

  async function unban(userId: string) {
    try {
      await roomsApi.unban(roomId, userId)
      onBansChange(bans.filter((b) => b.userId !== userId))
    } catch (err) { console.error(err) }
  }

  async function toggleAdmin(member: RoomMember) {
    try {
      if (member.role === 'admin') {
        await roomsApi.demoteAdmin(roomId, member.userId)
        onMembersChange(members.map((m) => m.userId === member.userId ? { ...m, role: 'member' } : m))
      } else {
        await roomsApi.promoteAdmin(roomId, member.userId)
        onMembersChange(members.map((m) => m.userId === member.userId ? { ...m, role: 'admin' } : m))
      }
    } catch (err) { console.error(err) }
  }

  const canActOn = (m: RoomMember) =>
    isAdmin && m.userId !== myId && m.userId !== ownerId &&
    !(m.role === 'admin' && myId !== ownerId)

  return (
    <div className="w-52 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">
      {/* Manage button */}
      {isAdmin && (
        <div className="px-3 pt-2 pb-1 shrink-0">
          <button
            onClick={onManage}
            className="w-full text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded px-2 py-1 text-left"
          >
            ⚙ Manage room
          </button>
        </div>
      )}
      {/* Tab bar */}
      <div className="flex border-b border-gray-800 shrink-0">
        <button
          onClick={() => setTab('members')}
          className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors
            ${tab === 'members' ? 'text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}
        >
          Members {members.length > 0 && `— ${members.length}`}
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab('bans')}
            className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors
              ${tab === 'bans' ? 'text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Bans {bans.length > 0 && `— ${bans.length}`}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {tab === 'members' && members.map((m) => (
          <div
            key={m.userId}
            className="flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-800/50 group"
            onMouseEnter={() => setHovered(m.userId)}
            onMouseLeave={() => setHovered(null)}
          >
            <PresenceDot userId={m.userId} />
            <span className="text-sm text-gray-300 truncate flex-1">{m.displayName}</span>
            {m.userId === ownerId
              ? <span className="text-xs text-yellow-500 shrink-0">owner</span>
              : m.role === 'admin'
                ? <span className="text-xs text-indigo-400 shrink-0">admin</span>
                : null}
            {canActOn(m) && hovered === m.userId && (
              <div className="flex gap-1 shrink-0">
                {myId === ownerId && (
                  <button
                    onClick={() => toggleAdmin(m)}
                    title={m.role === 'admin' ? 'Demote' : 'Make admin'}
                    className="text-xs text-gray-500 hover:text-indigo-400 px-1 rounded hover:bg-gray-700"
                  >
                    {m.role === 'admin' ? '↓' : '↑'}
                  </button>
                )}
                <button
                  onClick={() => kick(m.userId)}
                  title="Kick"
                  className="text-xs text-gray-500 hover:text-yellow-400 px-1 rounded hover:bg-gray-700"
                >
                  kick
                </button>
                <button
                  onClick={() => ban(m)}
                  title="Ban"
                  className="text-xs text-gray-500 hover:text-red-400 px-1 rounded hover:bg-gray-700"
                >
                  ban
                </button>
              </div>
            )}
          </div>
        ))}

        {tab === 'bans' && (
          bans.length === 0
            ? <p className="text-gray-600 text-xs text-center py-4">No bans.</p>
            : bans.map((b) => (
              <div key={b.userId} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-800/50">
                <span className="text-sm text-gray-400 truncate flex-1">{b.username}</span>
                <button
                  onClick={() => unban(b.userId)}
                  className="text-xs text-gray-500 hover:text-green-400 px-1 rounded hover:bg-gray-700 shrink-0"
                >
                  unban
                </button>
              </div>
            ))
        )}
      </div>
    </div>
  )
}

// ── Chat area ─────────────────────────────────────────────────────────────────
function ChatArea({
  chat: activeChat, userId, onRoomUpdated, onRoomDeleted,
}: {
  chat: ActiveChat
  userId: string
  onRoomUpdated?: (room: Room) => void
  onRoomDeleted?: (roomId: string) => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [members, setMembers] = useState<RoomMember[]>([])
  const [bans, setBans] = useState<RoomBan[]>([])
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null)
  const [managing, setManaging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const chatIdRef = useRef(activeChat.id)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const atBottomRef = useRef(true)

  const isRoom = activeChat.type === 'room'

  // Load history when chat changes
  useEffect(() => {
    chatIdRef.current = activeChat.id
    setMessages([])
    setHasMore(true)
    setInput('')
    atBottomRef.current = true
    if (isRoom) chat.joinRoom(activeChat.id)
    const loader = isRoom
      ? roomsApi.getMessages(activeChat.id)
      : dmsApi.getMessages(activeChat.id)
    loader.then((msgs) => {
      if (chatIdRef.current !== activeChat.id) return
      setMessages([...msgs].reverse())
      if (msgs.length < 50) setHasMore(false)
    }).catch(console.error)

    if (isRoom) {
      roomsApi.getMembers(activeChat.id).then(setMembers).catch(() => {})
      roomsApi.get(activeChat.id).then(setCurrentRoom).catch(() => {})
      roomsApi.getBans(activeChat.id).then(setBans).catch(() => { setBans([]) })
    }
  }, [activeChat.id, isRoom])

  // Smart autoscroll — only when already at bottom
  useEffect(() => {
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Scroll listener: track position + trigger infinite scroll
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    function onScroll() {
      if (!el) return
      atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      if (el.scrollTop < 120 && hasMore && !loadingMore) {
        loadOlderMessages()
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, messages])

  async function loadOlderMessages() {
    if (!hasMore || loadingMore || messages.length === 0) return
    setLoadingMore(true)
    const oldest = messages[0]
    try {
      const older = isRoom
        ? await roomsApi.getMessages(activeChat.id, oldest.createdAt, oldest.id)
        : await dmsApi.getMessages(activeChat.id, oldest.createdAt, oldest.id)
      if (older.length === 0 || older.length < 50) setHasMore(false)
      if (older.length > 0) {
        const el = listRef.current
        const prevScrollHeight = el?.scrollHeight ?? 0
        setMessages((prev) => [...[...older].reverse(), ...prev])
        // Restore scroll position so user doesn't jump
        requestAnimationFrame(() => {
          if (el) el.scrollTop += el.scrollHeight - prevScrollHeight
        })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingMore(false)
    }
  }

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
      else prev.onRoomMessage(roomId, msg)
    }
    handlers.onDmMessage = (chatId, msg) => {
      if (chatId === activeChat.id) setMessages((m) => [...m, msg])
      else prev.onDmMessage(chatId, msg)
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
    const replyId = replyingTo?.id
    setReplyingTo(null)
    try {
      if (isRoom) await chat.sendRoom(activeChat.id, content, replyId)
      else await chat.sendDm(activeChat.id, content, replyId)
    } catch (err) {
      console.error('Send failed:', err)
      setInput(content)
    }
  }

  function startReply(msg: Message) {
    setReplyingTo(msg)
    textareaRef.current?.focus()
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const path = isRoom ? `/rooms/${activeChat.id}/upload` : `/dms/${activeChat.id}/upload`
      await uploadFile(path, file)
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  async function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const file = e.clipboardData.files[0]
    if (!file) return
    e.preventDefault()
    setUploading(true)
    try {
      const path = isRoom ? `/rooms/${activeChat.id}/upload` : `/dms/${activeChat.id}/upload`
      await uploadFile(path, file, input.trim() || undefined)
      setInput('')
    } catch (err) {
      console.error('Paste upload failed:', err)
    } finally {
      setUploading(false)
    }
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
        <div ref={listRef} className="flex-1 overflow-y-auto py-4 space-y-0.5">
          {loadingMore && <p className="text-center text-xs text-gray-600 py-2">Loading…</p>}
          {messages.map((msg) => (
            <MessageItem
              key={msg.id}
              msg={msg}
              isMe={msg.authorId === userId}
              onEdit={(id, content) => { setEditingId(id); setEditContent(content) }}
              onDelete={deleteMsg}
              onReply={startReply}
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
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />
          {replyingTo && (
            <div className="mb-1 mx-1 flex items-center gap-2 bg-gray-800/60 border-l-2 border-indigo-500 px-3 py-1.5 rounded text-xs text-gray-400">
              <span className="truncate flex-1">
                <span className="text-indigo-400 font-medium">{replyingTo.authorUsername}</span>
                {': '}
                {replyingTo.content || '📎 attachment'}
              </span>
              <button onClick={() => setReplyingTo(null)} className="text-gray-600 hover:text-gray-300 shrink-0">✕</button>
            </div>
          )}
          <div className="bg-gray-800 rounded-xl flex items-end gap-2 px-4 py-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Attach file"
              className="text-gray-500 hover:text-gray-300 disabled:text-gray-700 pb-0.5 text-base"
            >
              {uploading ? '⏳' : '📎'}
            </button>
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder={`Message ${title}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
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
        <MemberPanel
          roomId={activeChat.id}
          members={members}
          bans={bans}
          ownerId={currentRoom?.ownerId ?? null}
          myId={userId}
          onMembersChange={setMembers}
          onBansChange={setBans}
          onManage={() => setManaging(true)}
        />
      )}

      {/* Manage room modal */}
      {managing && currentRoom && (
        <ManageRoomModal
          room={currentRoom}
          myId={userId}
          members={members}
          bans={bans}
          onMembersChange={setMembers}
          onBansChange={setBans}
          onRoomUpdated={(r) => { setCurrentRoom(r); onRoomUpdated?.(r) }}
          onRoomDeleted={() => { setManaging(false); onRoomDeleted?.(activeChat.id) }}
          onClose={() => setManaging(false)}
        />
      )}
    </div>
  )
}

// ── Account / settings modal ──────────────────────────────────────────────────
function AccountModal({ onClose }: { onClose: () => void }) {
  const { logout } = useAuth()
  const [sessions, setSessions] = useState<SessionDto[]>([])
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwSaving, setPwSaving] = useState(false)

  useEffect(() => {
    authApi.getSessions().then(setSessions).catch(console.error)
  }, [])

  async function revoke(id: string) {
    try {
      await authApi.revokeSession(id)
      setSessions((s) => s.filter((x) => x.id !== id))
    } catch (err) { console.error(err) }
  }

  async function changePassword() {
    if (!curPw || !newPw) return
    setPwSaving(true); setPwMsg(null)
    try {
      await authApi.changePassword(curPw, newPw)
      setPwMsg({ ok: true, text: 'Password changed.' })
      setCurPw(''); setNewPw('')
    } catch (err: unknown) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed.' })
    } finally { setPwSaving(false) }
  }

  async function deleteAccount() {
    if (confirm !== 'DELETE') return
    setDeleting(true)
    try {
      await authApi.deleteAccount()
      logout()
    } catch (err) {
      console.error(err)
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold">Account Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">✕</button>
        </div>

        {/* Sessions */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Active Sessions — {sessions.length}
          </p>
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {sessions.length === 0 && <p className="text-gray-600 text-sm">No active sessions.</p>}
            {sessions.map((s) => (
              <div key={s.id} className="flex items-start justify-between bg-gray-800 rounded-lg px-3 py-2 gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-200 truncate">{s.deviceInfo ?? 'Unknown device'}</p>
                  <p className="text-xs text-gray-500">{s.ipAddress ?? '—'} · {new Date(s.createdAt).toLocaleDateString()}</p>
                </div>
                <button
                  onClick={() => revoke(s.id)}
                  className="text-xs text-gray-500 hover:text-red-400 shrink-0 mt-0.5"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Change password */}
        <div className="border-t border-gray-800 pt-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Change Password</p>
          <input
            type="password"
            placeholder="Current password"
            value={curPw}
            onChange={(e) => setCurPw(e.target.value)}
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="password"
            placeholder="New password (min 8 chars)"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && changePassword()}
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {pwMsg && <p className={`text-xs ${pwMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{pwMsg.text}</p>}
          <button
            onClick={changePassword}
            disabled={!curPw || !newPw || pwSaving}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm py-2 rounded-lg"
          >
            {pwSaving ? 'Saving…' : 'Change Password'}
          </button>
        </div>

        {/* Danger zone */}
        <div className="border-t border-gray-800 pt-4">
          <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-3">Danger Zone</p>
          <p className="text-sm text-gray-400 mb-3">
            Permanently deletes your account, all your owned rooms, and your messages.
            Type <span className="font-mono text-white">DELETE</span> to confirm.
          </p>
          <div className="flex gap-2">
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE"
              className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500 font-mono"
            />
            <button
              onClick={deleteAccount}
              disabled={confirm !== 'DELETE' || deleting}
              className="bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg"
            >
              {deleting ? '…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
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
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newVis, setNewVis] = useState<'public' | 'private'>('public')

  useEffect(() => {
    roomsApi.list(1, search || undefined).then(setRooms).catch(console.error)
  }, [search])

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

        <input
          placeholder="Search rooms…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
        />

        <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
          {rooms.length === 0 && <p className="text-gray-500 text-sm text-center py-4">No public rooms yet.</p>}
          {rooms.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
              <div>
                <p className="text-white text-sm font-medium"># {r.name}</p>
                {r.description && <p className="text-gray-400 text-xs">{r.description}</p>}
                {r.memberCount !== undefined && (
                  <p className="text-gray-600 text-xs">{r.memberCount} member{r.memberCount !== 1 ? 's' : ''}</p>
                )}
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

// ── Friends modal ─────────────────────────────────────────────────────────────
function FriendsModal({ onClose, onFriendAdded }: { onClose: () => void; onFriendAdded: () => void }) {
  const [tab, setTab] = useState<'add' | 'requests'>('add')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    friendsApi.requests().then(setRequests).catch(console.error)
  }, [])

  async function search() {
    if (!query.trim()) return
    setSearching(true)
    try {
      setResults(await usersApi.search(query.trim()))
    } catch (err) { console.error(err) } finally { setSearching(false) }
  }

  async function sendRequest(userId: string) {
    try {
      await friendsApi.send(userId)
      setSent((s) => new Set(s).add(userId))
    } catch (err) { console.error(err) }
  }

  async function accept(requesterId: string) {
    try {
      await friendsApi.accept(requesterId)
      setRequests((r) => r.filter((x) => x.userId !== requesterId))
      onFriendAdded()
    } catch (err) { console.error(err) }
  }

  async function decline(requesterId: string) {
    try {
      await friendsApi.decline(requesterId)
      setRequests((r) => r.filter((x) => x.userId !== requesterId))
    } catch (err) { console.error(err) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold">Friends</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">✕</button>
        </div>

        <div className="flex gap-1 border-b border-gray-800">
          <button
            onClick={() => setTab('add')}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors
              ${tab === 'add' ? 'text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Add Friend
          </button>
          <button
            onClick={() => setTab('requests')}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors
              ${tab === 'requests' ? 'text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Requests {requests.length > 0 && `(${requests.length})`}
          </button>
        </div>

        {tab === 'add' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                autoFocus
                placeholder="Search by username…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={search}
                disabled={searching}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg"
              >
                {searching ? '…' : 'Search'}
              </button>
            </div>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {results.length === 0 && query && !searching && (
                <p className="text-gray-500 text-sm text-center py-3">No users found.</p>
              )}
              {results.map((u) => (
                <div key={u.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-white text-sm font-medium">{u.displayName}</p>
                    <p className="text-gray-500 text-xs">@{u.username}</p>
                  </div>
                  <button
                    onClick={() => sendRequest(u.id)}
                    disabled={sent.has(u.id)}
                    className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1 rounded-lg"
                  >
                    {sent.has(u.id) ? 'Sent' : 'Add'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'requests' && (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {requests.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">No pending requests.</p>
            )}
            {requests.map((r) => (
              <div key={r.userId} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                <div>
                  <p className="text-white text-sm font-medium">{r.displayName}</p>
                  <p className="text-gray-500 text-xs">@{r.username}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => accept(r.userId)}
                    className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded-lg"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => decline(r.userId)}
                    className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-lg"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
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
  const { counts: unread, bump, clear } = useUnread()
  const [myRooms, setMyRooms] = useState<Room[]>([])
  const [dms, setDms] = useState<Dm[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [active, setActive] = useState<ActiveChat | null>(null)
  const activeRef = useRef<ActiveChat | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const [settings, setSettings] = useState(false)
  const [friendsModal, setFriendsModal] = useState(false)

  useEffect(() => { activeRef.current = active }, [active])

  // Wire presence callbacks
  handlers.onPresenceChanged = useCallback((userId: string, status) => {
    setPresence(userId, status)
  }, [setPresence])

  // Bump unread for messages arriving in non-active chats
  handlers.onRoomMessage = useCallback((roomId, _msg) => {
    if (activeRef.current?.id !== roomId) bump(roomId)
  }, [bump])
  handlers.onDmMessage = useCallback((chatId, _msg) => {
    if (activeRef.current?.id !== chatId) bump(chatId)
  }, [bump])

  // Connect hubs once on mount
  useEffect(() => {
    connectHubs((presences) => setAll(presences)).catch(console.error)
    return () => { disconnectHubs().catch(console.error) }
  }, [setAll])

  // Load sidebar data
  useEffect(() => {
    const load = async () => {
      const [myRoomRes, dmList, friendList] = await Promise.allSettled([
        roomsApi.mine(),
        dmsApi.list(),
        friendsApi.list(),
      ])
      if (myRoomRes.status === 'fulfilled') setMyRooms(myRoomRes.value)
      if (dmList.status === 'fulfilled') setDms(dmList.value)
      if (friendList.status === 'fulfilled') setFriends(friendList.value)
    }
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])

  // Load joined rooms (use members endpoint per-room is expensive, so just show rooms the user has navigated to)
  // Better: server should expose GET /api/rooms/mine — for now, track locally
  const addRoom = useCallback((room: Room) => {
    setMyRooms((r) => r.some((x) => x.id === room.id) ? r : [...r, room])
    setActive({ type: 'room', id: room.id, name: room.name })
    clear(room.id)
    setBrowsing(false)
  }, [clear])

  function selectChat(c: ActiveChat) {
    setActive(c)
    clear(c.id)
  }

  async function openDm(userId: string) {
    try {
      const dm = await dmsApi.open(userId)
      setDms((d) => d.some((x) => x.id === dm.id) ? d : [dm, ...d])
      setActive({ type: 'dm', id: dm.id, otherUsername: dm.otherUsername })
      clear(dm.id)
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
        onSelect={selectChat}
        onOpenDm={openDm}
        onBrowse={() => setBrowsing(true)}
        onSettings={() => setSettings(true)}
        onAddFriend={() => setFriendsModal(true)}
        unread={unread}
      />

      <main className="flex flex-1 overflow-hidden">
        {active ? (
          <ChatArea
            chat={active}
            userId={user!.id}
            onRoomUpdated={(r) => {
              setMyRooms((rooms) => rooms.map((x) => x.id === r.id ? r : x))
              setActive((a) => a?.type === 'room' && a.id === r.id ? { ...a, name: r.name } : a)
            }}
            onRoomDeleted={(roomId) => {
              setMyRooms((rooms) => rooms.filter((x) => x.id !== roomId))
              setActive((a) => a?.id === roomId ? null : a)
            }}
          />
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
      {settings && <AccountModal onClose={() => setSettings(false)} />}
      {friendsModal && (
        <FriendsModal
          onClose={() => setFriendsModal(false)}
          onFriendAdded={() => {
            friendsApi.list().then(setFriends).catch(console.error)
          }}
        />
      )}
    </div>
  )
}
