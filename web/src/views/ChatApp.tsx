import {
  useState, useEffect, useRef, useCallback, type KeyboardEvent,
} from 'react'
import { roomsApi, dmsApi, friendsApi, usersApi, authApi, uploadFile, getAccessToken } from '../lib/api'
import type { BannedUserDto } from '../lib/types'
import { connectHubs, disconnectHubs, handlers, chat } from '../lib/hubs'
import { useAuth } from '../store/auth'
import { usePresence } from '../store/presence'
import { useUnread } from '../store/unread'
import type { ActiveChat, AttachmentDto, Dm, Friend, FriendRequest, Message, Room, RoomBan, RoomMember, SessionDto, UserSearchResult } from '../lib/types'

// ── Presence dot ──────────────────────────────────────────────────────────────
function PresenceDot({ userId }: { userId: string }) {
  const status = usePresence((s) => s.presences[userId] ?? 'offline')
  const color = status === 'online' ? 'bg-[#dfb7ff]' : status === 'afk' ? 'bg-[#ffb0cc]' : 'bg-[#4e4356]'
  return <span className={`inline-block w-2 h-2 rounded-full ${color} flex-shrink-0`} title={status} />
}

// ── Top navigation bar ────────────────────────────────────────────────────────
function TopNav({
  user, onPublicRooms, onPrivateRooms, onContacts, onSessions, onSignOut, onSettings,
  messageStyle, onMessageStyleChange,
}: {
  user: { username: string; id: string }
  onPublicRooms: () => void
  onPrivateRooms: () => void
  onContacts: () => void
  onSessions: () => void
  onSignOut: () => void
  onSettings: () => void
  messageStyle: 'terminal' | 'bubble' | 'compact'
  onMessageStyleChange: (s: 'terminal' | 'bubble' | 'compact') => void
}) {
  const [profileOpen, setProfileOpen] = useState(false)
  const presences = usePresence((s) => s.presences)
  const onlineCount = Object.values(presences).filter((p) => p === 'online').length

  return (
    <nav
      className="h-12 border-b border-[#353534] flex items-center px-5 gap-6 shrink-0 z-10"
      style={{ background: 'rgba(14,14,14,0.85)', backdropFilter: 'blur(8px)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <svg width="32" height="32" viewBox="0 0 16 16" style={{ color: 'var(--primary-cta)', filter: 'drop-shadow(0 0 8px var(--primary-cta))' }}>
          <rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" />
          <rect x="5.5" y="5.5" width="5" height="5" fill="currentColor" />
        </svg>
        <span className="font-bold font-headline uppercase tracking-tighter chromatic-aberration" style={{ fontSize: 20, color: '#ffffff', textShadow: '0 0 12px var(--primary-cta), 0 0 28px var(--primary-cta), 0 0 2px rgba(255,255,255,0.8)' }}>
          HACKER_MAN
        </span>
      </div>

      <button onClick={onPublicRooms} className="text-[#b8aac2] hover:text-[#dfb7ff] text-[11px] font-label uppercase tracking-[0.2em] transition-colors">Rooms</button>
      <button onClick={onContacts} className="text-[#b8aac2] hover:text-[#dfb7ff] text-[11px] font-label uppercase tracking-[0.2em] transition-colors">Contacts</button>
      <button onClick={onSessions} className="text-[#b8aac2] hover:text-[#dfb7ff] text-[11px] font-label uppercase tracking-[0.2em] transition-colors">Sessions</button>

      <div className="ml-auto flex items-center gap-4">
        {onlineCount > 0 && (
          <span className="font-mono text-[10px] text-[#b8aac2] uppercase tracking-[0.15em] flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5" style={{ background: 'var(--primary)' }} />
            {onlineCount} online
          </span>
        )}

        {/* Message style switcher */}
        <div className="flex gap-0.5">
          {(['terminal', 'bubble', 'compact'] as const).map((s) => (
            <button
              key={s}
              onClick={() => onMessageStyleChange(s)}
              className="font-label text-[9px] uppercase tracking-[0.1em] px-2 py-1 transition-colors"
              style={{
                background: messageStyle === s ? 'var(--primary-cta)' : 'transparent',
                color: messageStyle === s ? 'white' : 'var(--outline)',
              }}
            >
              {s === 'terminal' ? 'T' : s === 'bubble' ? 'B' : 'C'}
            </button>
          ))}
        </div>

        <div className="relative">
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="font-label text-[12px] uppercase tracking-[0.15em] flex items-center gap-1.5 transition-colors"
            style={{ color: 'var(--primary)' }}
          >
            <PresenceDot userId={user.id} />
            {user.username} ▾
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-7 min-w-44 z-50" style={{ background: 'var(--surface)', border: '1px solid var(--surface-highest)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
              <button
                onClick={() => { setProfileOpen(false); onSettings() }}
                className="raise w-full text-left px-3.5 py-2 text-[11px] font-label uppercase tracking-[0.15em] text-[#e5e2e1] transition-colors"
              >
                Account Settings
              </button>
              <button
                onClick={() => { setProfileOpen(false); onSessions() }}
                className="raise w-full text-left px-3.5 py-2 text-[11px] font-label uppercase tracking-[0.15em] text-[#e5e2e1] transition-colors"
              >
                Active Sessions
              </button>
              <div style={{ borderTop: '1px solid var(--surface-highest)' }} />
              <button
                onClick={() => { setProfileOpen(false); onSignOut() }}
                className="raise w-full text-left px-3.5 py-2 text-[11px] font-label uppercase tracking-[0.15em] transition-colors"
                style={{ color: 'var(--error)' }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({
  myRooms, dms, friends,
  active, onSelect, onOpenDm, onBrowse, onSettings, onAddFriend, onBanFriend, unread,
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
  onBanFriend: (userId: string) => void
  unread: Record<string, number>
}) {
  const { user } = useAuth()
  const [hoveredFriend, setHoveredFriend] = useState<string | null>(null)
  const [pubExpanded, setPubExpanded] = useState(true)
  const [privExpanded, setPrivExpanded] = useState(true)
  const [searchQ, setSearchQ] = useState('')

  const isActive = (c: ActiveChat) =>
    active?.type === c.type && active?.id === c.id

  const q = searchQ.toLowerCase()
  const publicRooms = myRooms.filter((r) => r.visibility === 'public' && (!q || r.name.toLowerCase().includes(q)))
  const privateRooms = myRooms.filter((r) => r.visibility !== 'public' && (!q || r.name.toLowerCase().includes(q)))
  const filteredFriends = friends.filter((f) => !q || f.displayName.toLowerCase().includes(q) || f.username.toLowerCase().includes(q))

  return (
    <div
      className="border-r border-[#353534] flex flex-col shrink-0 overflow-hidden"
      style={{ width: 252, background: 'rgba(28,27,27,0.7)', backdropFilter: 'blur(8px)' }}
    >
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: 'var(--surface-mid)', border: '1px solid transparent' }}>
          <span className="font-mono text-[11px] text-[#b8aac2] shrink-0">⌕</span>
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="SEARCH..."
            className="flex-1 bg-transparent text-[#e5e2e1] text-[11px] font-label uppercase tracking-[0.15em] outline-none placeholder:text-[#b8aac2]/50 border-0"
          />
        </div>
      </div>

      {/* Rooms */}
      <div className="mt-1">
        {/* Public Rooms */}
        <div>
          <div className="flex items-center justify-between px-4 mb-0.5">
            <button
              onClick={() => setPubExpanded((x) => !x)}
              className="flex items-center gap-1 text-xs font-bold font-label text-[#ffb0cc] uppercase tracking-[0.3em] hover:text-white transition-colors"
            >
              <span className={`transition-transform text-[10px] ${pubExpanded ? 'rotate-90' : ''}`}>▶</span>
              Public Rooms
            </button>
            <button onClick={onBrowse} className="text-[#b8aac2]/50 hover:text-[#dfb7ff] text-xs font-label transition-colors">Browse</button>
          </div>
          {pubExpanded && publicRooms.map((r) => (
            <NavItem
              key={r.id}
              label={`# ${r.name}`}
              active={isActive({ type: 'room', id: r.id, name: r.name })}
              onClick={() => onSelect({ type: 'room', id: r.id, name: r.name })}
              badge={unread[r.id]}
            />
          ))}
        </div>

        {/* Private Rooms */}
        {(privateRooms.length > 0 || !q) && (
          <div className="mt-3">
            <div className="flex items-center px-4 mb-0.5">
              <button
                onClick={() => setPrivExpanded((x) => !x)}
                className="flex items-center gap-1 text-xs font-bold font-label text-[#ffb0cc] uppercase tracking-[0.3em] hover:text-white transition-colors"
              >
                <span className={`transition-transform text-[10px] ${privExpanded ? 'rotate-90' : ''}`}>▶</span>
                Private Rooms
              </button>
            </div>
            {privExpanded && privateRooms.map((r) => (
              <NavItem
                key={r.id}
                label={`# ${r.name}`}
                active={isActive({ type: 'room', id: r.id, name: r.name })}
                onClick={() => onSelect({ type: 'room', id: r.id, name: r.name })}
                badge={unread[r.id]}
              />
            ))}
          </div>
        )}
      </div>

      {/* Direct Messages */}
      <div className="mt-4">
        <div className="flex items-center justify-between px-4 mb-0.5">
          <span className="text-xs font-bold font-label text-[#ffb0cc] uppercase tracking-[0.3em]">Direct Messages</span>
          <button onClick={onAddFriend} className="text-[#b8aac2]/50 hover:text-[#ffb0cc] text-sm font-label transition-colors">+</button>
        </div>
        {dms.map((dm) => {
          const badge = unread[dm.id]
          return (
            <NavItem
              key={dm.id}
              label={dm.otherUsername}
              active={isActive({ type: 'dm', id: dm.id, otherUserId: dm.otherUserId, otherUsername: dm.otherUsername, isFrozen: dm.isFrozen })}
              onClick={() => onOpenDm(dm.otherUserId)}
              badge={badge}
              right={<PresenceDot userId={dm.otherUserId} />}
              muted={dm.isFrozen}
            />
          )
        })}
      </div>

      {/* Footer */}
      <div className="mt-auto shrink-0" style={{ borderTop: '1px solid var(--surface-highest)', background: 'var(--surface-lowest)' }}>
        <div className="px-3.5 py-2.5 flex items-center gap-2.5">
          <PresenceDot userId={user!.id} />
          <div className="flex-1 min-w-0">
            <div className="font-label text-[12px] font-semibold uppercase tracking-[0.1em] truncate" style={{ color: 'var(--primary)' }}>{user!.username}</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: 'var(--outline)' }}>online · tab-leader</div>
          </div>
          <button onClick={onSettings} title="Settings" className="text-[14px] transition-colors" style={{ color: 'var(--outline)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--outline)')}
          >⚙</button>
        </div>
      </div>
    </div>
  )
}

function NavItem({
  label, active, onClick, right, badge, muted,
}: {
  label: string; active: boolean; onClick: () => void; right?: React.ReactNode; badge?: number; muted?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 py-1.5 text-[12px] font-label text-left transition-colors ${muted ? 'opacity-50' : ''}`}
      style={{
        padding: '5px 18px',
        background: active ? 'var(--surface-highest)' : 'transparent',
        color: active ? 'var(--primary)' : 'var(--outline)',
        borderLeft: active ? '2px solid var(--primary-cta)' : '2px solid transparent',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--primary)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--outline)' }}
    >
      {right && <span className="shrink-0">{right}</span>}
      <span className="truncate flex-1">{label}</span>
      {badge ? (
        <span className="text-white text-[9px] font-bold font-mono min-w-4 text-center px-1" style={{ background: 'var(--primary-cta)' }}>
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  )
}

// ── Attachment display ────────────────────────────────────────────────────────
// ── Day separator ────────────────────────────────────────────────────────────

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-2">
      <div className="flex-1 h-px" style={{ background: 'var(--surface-highest)' }} />
      <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: 'var(--outline)' }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--surface-highest)' }} />
    </div>
  )
}

function formatDay(d: Date) {
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ── Attachment display ────────────────────────────────────────────────────────────

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
                className="max-h-48 max-w-xs border border-[#353534] object-contain"
              />
            </a>
          )
        }
        return (
          <a
            key={a.id}
            href={url}
            download={a.originalFileName}
            className="flex items-center gap-2 bg-[#201f1f] hover:bg-[#353534] px-3 py-2 text-sm text-[#dfb7ff] border border-[#353534] transition-colors"
          >
            <span>📎</span>
            <span className="truncate max-w-xs text-sm font-label">{a.originalFileName}</span>
            <span className="text-[#b8aac2] text-xs shrink-0">{kb} KB</span>
          </a>
        )
      })}
    </div>
  )
}

// ── Message list ──────────────────────────────────────────────────────────────
function MessageItem({
  msg, isMe, canDelete, onEdit, onDelete, onReply, style = 'terminal',
}: {
  msg: Message
  isMe: boolean
  canDelete: boolean
  onEdit: (id: string, content: string) => void
  onDelete: (id: string) => void
  onReply: (msg: Message) => void
  style?: 'terminal' | 'bubble' | 'compact'
}) {
  const [hover, setHover] = useState(false)
  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

  const HoverActions = () => (
    <div
      className="flex gap-0.5"
      style={{ position: 'absolute', right: 20, top: -8, background: 'var(--surface)', border: '1px solid var(--surface-highest)', padding: 2 }}
    >
      <button onClick={() => onReply(msg)} title="Reply"
        className="font-label text-[11px] px-1.5 py-0.5 transition-colors"
        style={{ color: 'var(--outline)' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--outline)')}
      >↩</button>
      {isMe && msg.content && (
        <button onClick={() => onEdit(msg.id, msg.content)} title="Edit"
          className="font-label text-[11px] px-1.5 py-0.5 transition-colors"
          style={{ color: 'var(--outline)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--outline)')}
        >✎</button>
      )}
      {canDelete && (
        <button onClick={() => onDelete(msg.id)} title="Delete"
          className="font-label text-[11px] px-1.5 py-0.5"
          style={{ color: 'var(--error)' }}
        >×</button>
      )}
    </div>
  )

  const ReplyContext = ({ compact = false }: { compact?: boolean }) => msg.replyToId ? (
    <div style={{ borderLeft: '2px solid var(--primary-cta)', paddingLeft: compact ? 6 : 8, background: compact ? 'transparent' : 'var(--surface-low)', marginBottom: compact ? 2 : 3, padding: compact ? '0 0 0 6px' : '3px 10px 3px 8px', maxWidth: 520, fontSize: 11, color: 'var(--outline)' }}>
      <span className="font-label font-semibold" style={{ color: 'var(--primary)' }}>↩ {msg.replyToAuthor}</span>
      <span style={{ marginLeft: 8 }}>{msg.replyToContent || '📎 attachment'}</span>
    </div>
  ) : null

  if (style === 'bubble') {
    return (
      <div
        className="flex py-1 px-5 relative"
        style={{ justifyContent: isMe ? 'flex-end' : 'flex-start' }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {!isMe && (
          <div className="w-7 h-7 shrink-0 mr-2 mt-0.5 flex items-center justify-center font-mono text-[11px] font-bold" style={{ background: 'var(--surface-highest)', color: 'var(--primary)', border: '1px solid var(--surface-highest)' }}>
            {msg.authorUsername.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div style={{ maxWidth: '68%' }}>
          {!isMe && <div className="font-label text-[11px] mb-1 uppercase tracking-[0.05em]" style={{ color: 'var(--tertiary)' }}>{msg.authorUsername}</div>}
          <div style={{ background: isMe ? 'var(--primary-cta)' : 'var(--surface-mid)', color: isMe ? 'white' : 'var(--on-surface)', padding: '8px 12px', border: isMe ? 'none' : '1px solid var(--surface-highest)', position: 'relative' }}>
            <ReplyContext />
            {msg.content && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14 }}>{msg.content}</div>}
            <AttachmentList attachments={msg.attachments ?? []} />
          </div>
          <div className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--outline)', textAlign: isMe ? 'right' : 'left' }}>
            {time}{msg.editedAt ? ' · edited' : ''}
          </div>
        </div>
        {hover && <HoverActions />}
      </div>
    )
  }

  if (style === 'compact') {
    return (
      <div
        className="px-5 py-0.5 relative"
        style={{ display: 'grid', gridTemplateColumns: '60px 120px 1fr', gap: '0 12px', fontSize: 13, borderBottom: '1px dashed rgba(154,140,162,0.08)' }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <span className="font-mono text-[11px]" style={{ color: 'var(--outline)' }}>{time}</span>
        <span className="font-label font-semibold overflow-hidden text-ellipsis whitespace-nowrap" style={{ color: 'var(--tertiary)' }}>{msg.authorUsername}</span>
        <div style={{ minWidth: 0 }}>
          <ReplyContext compact />
          <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</span>
          {msg.editedAt && <span className="font-label italic ml-1.5" style={{ fontSize: 10, color: 'var(--outline)' }}>(edited)</span>}
          <AttachmentList attachments={msg.attachments ?? []} />
        </div>
        {hover && <HoverActions />}
      </div>
    )
  }

  // terminal (default)
  return (
    <div
      className="flex items-start px-5 py-0.5 relative"
      style={{ background: hover ? 'rgba(154,140,162,0.04)' : 'transparent' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex-1 min-w-0">
        <ReplyContext />
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono text-[11px] shrink-0" style={{ color: 'var(--outline)' }}>{time}</span>
          <span className="text-[14px] font-bold shrink-0 font-label" style={{ color: 'var(--tertiary)' }}>{msg.authorUsername}:</span>
          {msg.editedAt && <span className="text-[10px] italic font-label" style={{ color: 'var(--outline)' }}>(edited)</span>}
          {msg.content && <span className="text-[14px] whitespace-pre-wrap break-words" style={{ color: 'var(--on-surface)' }}>{msg.content}</span>}
        </div>
        <AttachmentList attachments={msg.attachments ?? []} />
      </div>
      {hover && <HoverActions />}
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
  const [tab, setTab] = useState<'members' | 'admins' | 'bans' | 'invites' | 'settings'>('members')
  const isOwner = room.ownerId === myId
  const isAdmin = members.find((m) => m.userId === myId)?.role === 'admin'

  const canActOnMember = (m: RoomMember) =>
    isAdmin && m.userId !== myId && m.userId !== room.ownerId &&
    !(m.role === 'admin' && !isOwner)

  async function modalBan(m: RoomMember) {
    try {
      await roomsApi.ban(room.id, m.userId)
      onMembersChange(members.filter((x) => x.userId !== m.userId))
      onBansChange([...bans, { userId: m.userId, username: m.username, bannedById: myId, createdAt: new Date().toISOString() }])
    } catch (err) { console.error(err) }
  }

  async function modalUnban(userId: string) {
    try {
      await roomsApi.unban(room.id, userId)
      onBansChange(bans.filter((b) => b.userId !== userId))
    } catch (err) { console.error(err) }
  }

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

  const inputCls = "w-full bg-[#201f1f] text-[#e5e2e1] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#9d00ff] border-0 font-body"

  const Tab = ({ id, label }: { id: typeof tab; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-3 py-2 text-xs font-bold font-label uppercase tracking-wider transition-colors
        ${tab === id ? 'text-[#dfb7ff] border-b-2 border-[#9d00ff]' : 'text-[#e5e2e1]/40 hover:text-[#dfb7ff]'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-lg space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--surface-highest)', boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 40px rgba(157,0,255,0.1)', maxHeight: '85vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--surface-highest)', background: 'var(--surface-low)' }}>
          <span className="font-label text-[12px] uppercase tracking-[0.2em] font-bold" style={{ color: 'var(--primary)' }}>// Manage # {room.name}</span>
          <button onClick={onClose} style={{ color: 'var(--outline)', fontSize: 16 }}>✕</button>
        </div>
        <div className="px-4 pb-4 space-y-4">

        <div className="flex gap-0.5" style={{ borderBottom: '1px solid var(--surface-highest)', marginBottom: 14 }}>
          <Tab id="members" label="Members" />
          <Tab id="admins" label="Admins" />
          {isAdmin && <Tab id="bans" label="Banned" />}
          {(isAdmin || isOwner) && <Tab id="invites" label="Invitations" />}
          {isOwner && <Tab id="settings" label="Settings" />}
        </div>

        {/* Members tab */}
        {tab === 'members' && (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center gap-2 bg-[#201f1f] px-3 py-2">
                <PresenceDot userId={m.userId} />
                <div className="flex-1 min-w-0">
                  <p className="text-[#e5e2e1] text-sm truncate font-label">{m.displayName}</p>
                  <p className="text-xs text-[#b8aac2] font-label uppercase tracking-wider">
                    {m.userId === room.ownerId ? 'owner' : m.role}
                  </p>
                </div>
                {canActOnMember(m) && (
                  <div className="flex gap-1">
                    {isOwner && (
                      <button
                        onClick={() => toggleAdmin(m)}
                        className="text-xs bg-[#353534] hover:bg-[#9d00ff] text-[#dfb7ff] hover:text-white px-2 py-1 font-label uppercase tracking-wider transition-colors"
                      >
                        {m.role === 'admin' ? 'Demote' : 'Promote'}
                      </button>
                    )}
                    <button
                      onClick={() => modalBan(m)}
                      className="text-xs bg-[#ffb4ab]/10 hover:bg-[#ffb4ab]/20 text-[#ffb4ab] px-2 py-1 font-label uppercase tracking-wider border border-[#ffb4ab]/20 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Bans tab */}
        {tab === 'bans' && (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {bans.length === 0
              ? <p className="text-[#b8aac2] text-sm text-center py-4 font-label">// No banned users.</p>
              : bans.map((b) => (
                <div key={b.userId} className="flex items-center gap-2 bg-[#201f1f] px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[#e5e2e1] text-sm font-label">{b.username}</p>
                    <p className="text-xs text-[#b8aac2] font-label">
                      Banned by {members.find((m) => m.userId === b.bannedById)?.displayName ?? 'admin'}
                    </p>
                  </div>
                  <button
                    onClick={() => modalUnban(b.userId)}
                    className="text-xs bg-[#d5baff]/10 hover:bg-[#9d00ff] hover:text-white text-[#d5baff] px-2 py-1 border border-[#d5baff]/30 font-label uppercase tracking-wider transition-colors"
                  >
                    Unban
                  </button>
                </div>
              ))
            }
          </div>
        )}

        {/* Admins tab */}
        {tab === 'admins' && (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {members.filter((m) => m.role === 'admin').length === 0 && (
              <p className="text-[#b8aac2] text-sm text-center py-4 font-label">// No admins yet.</p>
            )}
            {members.filter((m) => m.role === 'admin').map((m) => (
              <div key={m.userId} className="flex items-center gap-2 bg-[#201f1f] px-3 py-2">
                <PresenceDot userId={m.userId} />
                <div className="flex-1 min-w-0">
                  <p className="text-[#e5e2e1] text-sm truncate font-label">{m.displayName}</p>
                  {m.userId === room.ownerId && <p className="text-[#ffb0cc] text-xs font-label uppercase">owner</p>}
                </div>
                {isOwner && m.userId !== myId && (
                  <button
                    onClick={() => toggleAdmin(m)}
                    className="text-xs bg-[#353534] hover:bg-[#9d00ff] text-[#dfb7ff] hover:text-white px-2 py-1 font-label uppercase tracking-wider transition-colors"
                  >
                    Demote
                  </button>
                )}
              </div>
            ))}
            {isOwner && (
              <div className="pt-2 border-t border-[#353534]/20">
                <p className="text-xs text-[#b8aac2] mb-2 font-label uppercase tracking-wider">Promote a member to admin:</p>
                {members.filter((m) => m.role !== 'admin').map((m) => (
                  <div key={m.userId} className="flex items-center gap-2 py-1">
                    <span className="text-sm text-[#e5e2e1]/60 flex-1 truncate font-label">{m.displayName}</span>
                    <button
                      onClick={() => toggleAdmin(m)}
                      className="text-xs bg-[#9d00ff] hover:brightness-110 text-white px-2 py-1 font-label uppercase tracking-wider transition-all"
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
                placeholder="Search by username..."
                value={inviteQuery}
                onChange={(e) => setInviteQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchInvite()}
                className={inputCls}
              />
              <button
                onClick={searchInvite}
                className="bg-[#9d00ff] hover:brightness-110 text-white text-sm font-label uppercase tracking-wider px-4 py-2 transition-all active:scale-95"
              >
                Search
              </button>
            </div>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {inviteResults.map((u) => {
                const alreadyMember = members.some((m) => m.userId === u.id)
                return (
                  <div key={u.id} className="flex items-center justify-between bg-[#201f1f] px-3 py-2">
                    <div>
                      <p className="text-[#e5e2e1] text-sm font-label">{u.displayName}</p>
                      <p className="text-[#b8aac2] text-xs font-label">@{u.username}</p>
                    </div>
                    <button
                      onClick={() => invite(u.id)}
                      disabled={alreadyMember || invited.has(u.id)}
                      className="text-xs bg-[#9d00ff] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1 font-label uppercase tracking-wider transition-all"
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
            <div className="space-y-1">
              <label className="text-xs font-bold font-label text-[#b8aac2] uppercase tracking-[0.2em]">Room Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold font-label text-[#b8aac2] uppercase tracking-[0.2em]">Description</label>
              <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold font-label text-[#b8aac2] uppercase tracking-[0.2em]">Visibility</label>
              <select
                value={vis}
                onChange={(e) => setVis(e.target.value as 'public' | 'private')}
                className="w-full bg-[#201f1f] text-[#e5e2e1] px-3 py-2 text-sm outline-none border-0 font-label"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
            {saveErr && <p className="text-[#ffb4ab] text-xs font-label">// {saveErr}</p>}
            <button
              onClick={saveSettings}
              disabled={saving}
              className="w-full bg-[#9d00ff] hover:brightness-110 disabled:opacity-40 text-white text-sm font-label uppercase tracking-wider py-2 transition-all active:scale-95"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>

            <div className="border-t border-[#353534]/20 pt-4 space-y-2">
              <p className="text-xs font-bold font-label text-[#ffb4ab] uppercase tracking-[0.2em]">// Danger Zone</p>
              <p className="text-sm text-[#e5e2e1]/50 font-body">
                Type <span className="font-mono text-[#e5e2e1]">{room.name}</span> to confirm deletion.
              </p>
              <div className="flex gap-2">
                <input
                  value={delConfirm}
                  onChange={(e) => setDelConfirm(e.target.value)}
                  placeholder={room.name}
                  className="flex-1 bg-[#201f1f] text-[#e5e2e1] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#ffb4ab] border-0 font-mono"
                />
                <button
                  onClick={deleteRoom}
                  disabled={delConfirm !== room.name || deleting}
                  className="bg-[#ffb4ab]/20 hover:bg-[#ffb4ab]/40 border border-[#ffb4ab]/30 disabled:opacity-40 text-[#ffb4ab] text-sm font-label uppercase tracking-wider px-4 py-2 transition-colors"
                >
                  {deleting ? '...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        </div>{/* /px-4 pb-4 */}
      </div>
    </div>
  )
}

// ── Member panel (with moderation) ───────────────────────────────────────────
function MemberRow({
  m, myId, ownerId, canActOn, friendIds, requested, onAddFriend, onToggleAdmin, onBan, dim,
}: {
  m: RoomMember; myId: string; ownerId: string | null
  canActOn: boolean; friendIds: Set<string>; requested: Set<string>
  onAddFriend: (id: string) => void; onToggleAdmin: (m: RoomMember) => void; onBan: (m: RoomMember) => void
  dim?: boolean
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="flex items-center gap-2 cursor-pointer"
      style={{ padding: '4px 16px', opacity: dim ? 0.45 : 1, background: hovered ? 'rgba(154,140,162,0.06)' : 'transparent', fontSize: 12 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <PresenceDot userId={m.userId} />
      <span className="flex-1 truncate font-label" style={{ color: 'var(--on-surface)' }}>{m.displayName}</span>
      {!hovered && (m.userId === ownerId
        ? <span className="font-label text-[8px] uppercase tracking-[0.2em] font-bold shrink-0" style={{ color: 'var(--tertiary)' }}>OWN</span>
        : m.role === 'admin'
          ? <span className="font-label text-[8px] uppercase tracking-[0.2em] font-bold shrink-0" style={{ color: 'var(--primary)' }}>ADM</span>
          : null)}
      {hovered && (
        <div className="flex gap-0.5 shrink-0">
          {m.userId !== myId && !friendIds.has(m.userId) && (
            <button
              onClick={() => onAddFriend(m.userId)}
              disabled={requested.has(m.userId)}
              title="Add friend"
              className="text-[11px] font-label px-1 transition-colors"
              style={{ color: requested.has(m.userId) ? 'var(--primary)' : 'var(--outline)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = requested.has(m.userId) ? 'var(--primary)' : 'var(--outline)')}
            >{requested.has(m.userId) ? '✓' : '+'}</button>
          )}
          {canActOn && (
            <>
              {myId === ownerId && (
                <button onClick={() => onToggleAdmin(m)} title={m.role === 'admin' ? 'Demote' : 'Make admin'}
                  className="text-[11px] font-label px-1 transition-colors"
                  style={{ color: 'var(--outline)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--outline)')}
                >{m.role === 'admin' ? '↓' : '↑'}</button>
              )}
              <button onClick={() => onBan(m)} title="Remove from room"
                className="text-[11px] font-label px-1"
                style={{ color: 'var(--error)' }}
              >✕</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── DM sidebar ────────────────────────────────────────────────────────────

function DmSidebar({
  dm, myId, onBlock,
}: {
  dm: ActiveChat & { type: 'dm' }
  myId: string
  onBlock: () => void
}) {
  const status = usePresence((s) => s.presences[dm.otherUserId ?? ''] ?? 'offline')
  const initials = (dm.otherUsername ?? '??').slice(0, 2).toUpperCase()

  return (
    <div className="flex flex-col shrink-0 p-4" style={{ width: 240, background: 'var(--surface-low)', borderLeft: '1px solid var(--surface-highest)' }}>
      {/* Avatar and info */}
      <div className="text-center mb-4">
        <div className="mx-auto mb-2.5 flex items-center justify-center font-mono text-[20px] font-bold"
          style={{ width: 72, height: 72, background: 'var(--surface-highest)', color: 'var(--primary)', border: '1px solid var(--primary-cta)' }}
        >
          {initials}
        </div>
        <div className="font-label text-[14px] font-bold uppercase tracking-[0.05em]" style={{ color: 'var(--primary)' }}>@{dm.otherUsername}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] mt-1 flex items-center justify-center gap-1.5" style={{ color: 'var(--outline)' }}>
          <PresenceDot userId={dm.otherUserId ?? ''} />
          {status}
        </div>
      </div>

      <div className="font-label text-[9px] font-bold uppercase tracking-[0.3em] mb-1.5" style={{ color: 'var(--outline)' }}>// Info</div>
      <div className="font-mono text-[11px] leading-relaxed" style={{ color: 'var(--outline)' }}>
        <div>friends since —</div>
        <div>shared rooms: —</div>
      </div>

      {/* Actions */}
      {dm.isFrozen ? (
        <div className="mt-5 p-2.5" style={{ background: 'rgba(255,180,171,0.08)', border: '1px solid rgba(255,180,171,0.25)' }}>
          <div className="font-label text-[9px] font-bold uppercase tracking-[0.25em] mb-1" style={{ color: 'var(--error)' }}>// Blocked</div>
          <div className="text-[11px] leading-relaxed" style={{ color: 'var(--on-surface-muted)' }}>You have blocked this user. DM is read-only.</div>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-1">
          <button
            className="raise w-full text-left px-2.5 py-2 text-[11px] font-label uppercase tracking-[0.2em] transition-colors"
            style={{ color: 'var(--outline)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--on-surface)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--outline)')}
          >View profile</button>
          <button
            onClick={onBlock}
            className="raise w-full text-left px-2.5 py-2 text-[11px] font-label uppercase tracking-[0.2em] transition-colors"
            style={{ color: 'var(--error)' }}
          >Block user</button>
        </div>
      )}
    </div>
  )
}

// ── Member group (for panel) ──────────────────────────────────────────────────
function MemberGroup({
  label, members, dim, myId, ownerId, canActOnMember, friendIds, requested, onAddFriend, onToggleAdmin, onBan,
}: {
  label: string; members: RoomMember[]; dim?: boolean
  myId: string; ownerId: string | null
  canActOnMember: (m: RoomMember) => boolean
  friendIds: Set<string>; requested: Set<string>
  onAddFriend: (id: string) => void
  onToggleAdmin: (m: RoomMember) => void
  onBan: (m: RoomMember) => void
}) {
  return (
    <div className="mb-2">
      <div className="font-label text-[9px] font-bold uppercase tracking-[0.3em] px-4 mb-1" style={{ color: 'var(--outline)' }}>{label}</div>
      {members.map((m) => (
        <MemberRow
          key={m.userId}
          m={m}
          myId={myId}
          ownerId={ownerId}
          canActOn={canActOnMember(m)}
          friendIds={friendIds}
          requested={requested}
          onAddFriend={onAddFriend}
          onToggleAdmin={onToggleAdmin}
          onBan={onBan}
          dim={dim}
        />
      ))}
    </div>
  )
}

// ── Member panel ──────────────────────────────────────────────────────────

function MemberPanel({
  room, roomId, members, bans, ownerId, myId, friendIds,
  onMembersChange, onBansChange, onManage, onInvite,
}: {
  room: Room | null
  roomId: string
  members: RoomMember[]
  bans: RoomBan[]
  ownerId: string | null
  myId: string
  friendIds: Set<string>
  onMembersChange: (m: RoomMember[]) => void
  onBansChange: (b: RoomBan[]) => void
  onManage: () => void
  onInvite: () => void
}) {
  const [requested, setRequested] = useState<Set<string>>(new Set())

  const myRole = members.find((m) => m.userId === myId)?.role ?? 'member'
  const isAdmin = myRole === 'admin' || myId === ownerId

  const ownerMember = members.find((m) => m.userId === ownerId)
  const adminMembers = members.filter((m) => m.role === 'admin' && m.userId !== ownerId)

  async function ban(member: RoomMember) {
    try {
      await roomsApi.ban(roomId, member.userId)
      onMembersChange(members.filter((m) => m.userId !== member.userId))
      onBansChange([...bans, { userId: member.userId, username: member.username, bannedById: myId, createdAt: new Date().toISOString() }])
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

  async function addFriend(userId: string) {
    try {
      await friendsApi.send(userId)
      setRequested((s) => new Set(s).add(userId))
    } catch (err) { console.error(err) }
  }

  const canActOnMember = (m: RoomMember) =>
    isAdmin && m.userId !== myId && m.userId !== ownerId &&
    !(m.role === 'admin' && myId !== ownerId)

  const presences = usePresence((s) => s.presences)
  const online = members.filter((m) => (presences[m.userId] ?? 'offline') === 'online')
  const afk = members.filter((m) => (presences[m.userId] ?? 'offline') === 'afk')
  const offline = members.filter((m) => (presences[m.userId] ?? 'offline') === 'offline')

  return (
    <div className="flex flex-col shrink-0" style={{ width: 240, background: 'var(--surface-low)', borderLeft: '1px solid var(--surface-highest)' }}>
      {/* Room info */}
      {room && (
        <div className="px-4 py-3.5 shrink-0" style={{ borderBottom: '1px solid var(--surface-highest)' }}>
          <div className="font-label text-[10px] font-bold uppercase tracking-[0.3em] mb-1.5" style={{ color: 'var(--tertiary)' }}>// Room</div>
          {room.description && (
            <div className="text-[12px] leading-relaxed mb-2" style={{ color: 'var(--on-surface-muted)' }}>{room.description}</div>
          )}
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] flex flex-col gap-0.5" style={{ color: 'var(--outline)' }}>
            <div>visibility: <span style={{ color: 'var(--primary)' }}>{room.visibility}</span></div>
            {ownerMember && <div>owner: <span style={{ color: 'var(--tertiary)' }}>@{ownerMember.username ?? ownerMember.displayName}</span></div>}
          </div>
        </div>
      )}

      {/* Members grouped */}
      <div className="flex-1 overflow-y-auto py-2">
        <MemberGroup label={`Online — ${online.length}`} members={online} myId={myId} ownerId={ownerId} canActOnMember={canActOnMember} friendIds={friendIds} requested={requested} onAddFriend={addFriend} onToggleAdmin={toggleAdmin} onBan={ban} />
        {afk.length > 0 && <MemberGroup label={`AFK — ${afk.length}`} members={afk} myId={myId} ownerId={ownerId} canActOnMember={canActOnMember} friendIds={friendIds} requested={requested} onAddFriend={addFriend} onToggleAdmin={toggleAdmin} onBan={ban} />}
        {offline.length > 0 && <MemberGroup label={`Offline — ${offline.length}`} members={offline} dim myId={myId} ownerId={ownerId} canActOnMember={canActOnMember} friendIds={friendIds} requested={requested} onAddFriend={addFriend} onToggleAdmin={toggleAdmin} onBan={ban} />}
      </div>

      {/* Bottom actions */}
      <div className="shrink-0 flex flex-col gap-1 p-2.5" style={{ borderTop: '1px solid var(--surface-highest)' }}>
        <button
          onClick={onInvite}
          className="raise w-full text-left px-2.5 py-2 text-[11px] font-label uppercase tracking-[0.2em]"
          style={{ color: 'var(--outline)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--outline)')}
        >+ Invite user</button>
        <button
          onClick={onManage}
          className="raise w-full text-left px-2.5 py-2 text-[11px] font-label uppercase tracking-[0.2em]"
          style={{ color: 'var(--outline)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--outline)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--outline)')}
        >⚙ Manage room</button>
      </div>
    </div>
  )
}

// ── Chat area ─────────────────────────────────────────────────────────────────
function ChatArea({
  chat: activeChat, userId, friendIds, messageStyle, onRoomUpdated, onRoomDeleted,
}: {
  chat: ActiveChat
  userId: string
  friendIds: Set<string>
  messageStyle: 'terminal' | 'bubble' | 'compact'
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
  const isFrozen = activeChat.type === 'dm' && activeChat.isFrozen === true

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

  useEffect(() => {
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

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
        <div
          className="shrink-0 flex items-center gap-3 px-5"
          style={{ height: 54, borderBottom: '1px solid var(--surface-highest)', background: 'rgba(14,14,14,0.6)' }}
        >
          <div className="flex-1 min-w-0">
            <div className="font-label text-[14px] font-bold uppercase tracking-[0.05em] truncate" style={{ color: 'var(--primary)' }}>{title}</div>
            {isRoom && currentRoom?.description && (
              <div className="text-[11px] mt-px truncate" style={{ color: 'var(--outline)' }}>{currentRoom.description}</div>
            )}
          </div>
          {isRoom && (
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] shrink-0" style={{ color: 'var(--outline)' }}>
              {members.length} members
            </span>
          )}
          {isRoom && (members.find((m) => m.userId === userId)?.role === 'admin' || currentRoom?.ownerId === userId) && (
            <button
              onClick={() => setManaging(true)}
              className="font-label text-[10px] uppercase tracking-[0.2em] px-2.5 py-1 transition-colors shrink-0"
              style={{ color: 'var(--outline)', border: '1px solid var(--surface-highest)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.borderColor = 'var(--primary-cta)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--outline)'; e.currentTarget.style.borderColor = 'var(--surface-highest)' }}
            >⚙ Manage</button>
          )}
        </div>

        {/* Message list */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-4 space-y-0.5">
          {loadingMore && (
            <div className="flex items-center gap-3 px-4 py-2">
              <div className="flex-1 border-t border-[#353534]/20" />
              <span className="text-xs text-[#b8aac2] shrink-0 font-label uppercase tracking-wider">// older messages</span>
              <div className="flex-1 border-t border-[#353534]/20" />
            </div>
          )}
          {(() => {
            const grouped: ({ type: 'sep'; label: string } | { type: 'msg'; msg: Message })[] = []
            let lastDay = ''
            for (const msg of messages) {
              const day = new Date(msg.createdAt).toDateString()
              if (day !== lastDay) {
                grouped.push({ type: 'sep', label: formatDay(new Date(msg.createdAt)) })
                lastDay = day
              }
              grouped.push({ type: 'msg', msg })
            }
            return grouped.map((item) => {
              if (item.type === 'sep') {
                return <DaySeparator key={item.label} label={item.label} />
              }
              const msg = item.msg
              const isMe = msg.authorId === userId
              const isAdmin = isRoom && members.find((m) => m.userId === userId)?.role === 'admin'
              return (
                <MessageItem
                  key={msg.id}
                  msg={msg}
                  isMe={isMe}
                  canDelete={isMe || (isRoom && !!isAdmin)}
                  onEdit={(id, content) => { setEditingId(id); setEditContent(content) }}
                  onDelete={deleteMsg}
                  onReply={startReply}
                  style={messageStyle}
                />
              )
            })
          })()}
          <div ref={bottomRef} />
        </div>

        {/* Edit bar */}
        {editingId && (
          <div className="mx-5 mb-2 flex gap-2.5 p-2.5" style={{ background: 'var(--surface-mid)', border: '1px solid var(--primary-cta)' }}>
            <input
              autoFocus
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
              className="flex-1 bg-transparent outline-none font-body text-[13px]"
              style={{ color: 'var(--on-surface)' }}
            />
            <button onClick={saveEdit} className="font-label text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: 'var(--primary)' }}>Save</button>
            <button onClick={() => setEditingId(null)} className="font-label text-[10px] uppercase tracking-[0.2em]" style={{ color: 'var(--outline)' }}>Cancel</button>
          </div>
        )}

        {/* Frozen DM banner */}
        {isFrozen && (
          <div className="mx-5 mb-2 flex items-center gap-3 px-4 py-3" style={{ background: 'var(--surface-low)', border: '1px dashed var(--surface-highest)' }}>
            <span className="text-[18px]" style={{ color: 'var(--error)' }}>⊘</span>
            <div className="flex-1">
              <div className="font-label text-[11px] uppercase tracking-[0.2em] font-bold" style={{ color: 'var(--error)' }}>// Conversation frozen</div>
              <div className="text-[12px] mt-0.5" style={{ color: 'var(--outline)' }}>This DM is read-only. History is preserved. No new messages can be sent.</div>
            </div>
          </div>
        )}

        {/* Input */}
        {!isFrozen && (
          <div className="px-5 pb-4 shrink-0">
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
            <div style={{ background: 'var(--surface-mid)', border: '1px solid var(--surface-highest)' }}>
              {replyingTo && (
                <div className="flex items-start gap-2.5 px-3 py-1.5" style={{ borderBottom: '1px solid var(--surface-highest)', borderLeft: '2px solid var(--primary-cta)', background: 'var(--surface-low)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="font-label text-[10px] uppercase tracking-[0.15em] mb-0.5" style={{ color: 'var(--outline)' }}>
                      ↩ Replying to <span className="font-semibold" style={{ color: 'var(--primary)' }}>{replyingTo.authorUsername}</span>
                    </p>
                    <p className="text-[12px] truncate" style={{ color: 'var(--outline)' }}>{replyingTo.content || '📎 attachment'}</p>
                  </div>
                  <button onClick={() => setReplyingTo(null)} style={{ color: 'var(--outline)' }} className="text-xs mt-0.5 shrink-0">✕</button>
                </div>
              )}
              <div className="flex items-end gap-2 px-2.5 py-1.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  title="Attach file"
                  className="text-[18px] font-bold leading-none transition-colors py-1 px-2 shrink-0"
                  style={{ color: 'var(--tertiary)' }}
                >
                  {uploading ? '⏳' : '+'}
                </button>
                <textarea
                  ref={textareaRef}
                  rows={1}
                  placeholder={`Message ${title}`}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    const el = e.target
                    el.style.height = 'auto'
                    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
                  }}
                  onKeyDown={onKeyDown}
                  onPaste={onPaste}
                  className="flex-1 bg-transparent resize-none outline-none max-h-40 font-body"
                  style={{ color: 'var(--on-surface)', fontSize: 14, lineHeight: 1.5, padding: '6px 0', minHeight: 28 }}
                />
                <span className="font-mono text-[10px] shrink-0" style={{ color: input.length > 2800 ? 'var(--error)' : 'var(--outline-variant)' }}>{input.length}/3072</span>
                <button
                  onClick={send}
                  disabled={!input.trim()}
                  className="font-label text-[10px] uppercase tracking-[0.25em] font-bold px-3.5 py-1.5 shrink-0 transition-colors"
                  style={{ background: input.trim() ? 'var(--primary-cta)' : 'var(--surface-highest)', color: input.trim() ? 'white' : 'var(--outline)' }}
                >
                  Send ↵
                </button>
              </div>
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.15em] px-1 mt-1" style={{ color: 'var(--outline-variant)' }}>
              ↵ send · shift+↵ newline · paste image to upload
            </div>
          </div>
        )}
      </div>

      {/* Room members panel */}
      {isRoom && (
        <MemberPanel
          room={currentRoom}
          roomId={activeChat.id}
          members={members}
          bans={bans}
          ownerId={currentRoom?.ownerId ?? null}
          myId={userId}
          friendIds={friendIds}
          onMembersChange={setMembers}
          onBansChange={setBans}
          onManage={() => setManaging(true)}
          onInvite={() => setManaging(true)}
        />
      )}

      {/* DM sidebar */}
      {!isRoom && (
        <DmSidebar
          dm={activeChat as ActiveChat & { type: 'dm' }}
          myId={userId}
          onBlock={() => {
            try {
              usersApi.banUser(activeChat.otherUserId ?? '')
            } catch (err) { console.error('Block failed:', err) }
          }}
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

// ── Sessions modal ────────────────────────────────────────────────────────────
function SessionsModal({ onClose }: { onClose: () => void }) {
  const [sessions, setSessions] = useState<SessionDto[]>([])

  useEffect(() => {
    authApi.getSessions().then(setSessions).catch(console.error)
  }, [])

  async function revoke(id: string) {
    try {
      await authApi.revokeSession(id)
      setSessions((s) => s.filter((x) => x.id !== id))
    } catch (err) { console.error(err) }
  }

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-md" style={{ background: 'var(--surface)', border: '1px solid var(--surface-highest)', boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 40px rgba(157,0,255,0.1)', maxHeight: '85vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--surface-highest)', background: 'var(--surface-low)' }}>
          <span className="font-label text-[12px] uppercase tracking-[0.2em] font-bold" style={{ color: 'var(--primary)' }}>// Active Sessions</span>
          <button onClick={onClose} style={{ color: 'var(--outline)', fontSize: 16 }}>✕</button>
        </div>
        <div className="p-4 space-y-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.1em] mb-2" style={{ color: 'var(--outline)' }}>Revoking a session signs out that browser immediately.</div>
          {sessions.length === 0 && <p className="font-label text-[12px]" style={{ color: 'var(--outline)' }}>// No active sessions.</p>}
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-2.5 px-3 py-2" style={{ background: 'var(--surface-low)' }}>
              <span style={{ fontSize: 14 }}>▪</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-label" style={{ color: 'var(--on-surface)' }}>{s.deviceInfo ?? 'Unknown device'}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--outline)' }}>{s.ipAddress ?? '—'} · {new Date(s.createdAt).toLocaleDateString()}</div>
              </div>
              <button
                onClick={() => revoke(s.id)}
                className="font-label text-[10px] uppercase tracking-[0.15em] font-bold px-2 py-1 transition-colors"
                style={{ background: 'rgba(255,180,171,0.12)', color: 'var(--error)', border: '1px solid rgba(255,180,171,0.3)' }}
              >Revoke</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Account / settings modal ──────────────────────────────────────────────────
function AccountModal({ onClose }: { onClose: () => void }) {
  const { logout } = useAuth()
  const [blocked, setBlocked] = useState<BannedUserDto[]>([])
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwSaving, setPwSaving] = useState(false)

  useEffect(() => {
    usersApi.getBans().then(setBlocked).catch(console.error)
  }, [])

  async function unblockUser(userId: string) {
    try {
      await usersApi.unbanUser(userId)
      setBlocked((b) => b.filter((x) => x.userId !== userId))
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

  const inputCls = "w-full bg-[#201f1f] text-[#e5e2e1] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#9d00ff] border-0 font-body"

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-md" style={{ background: 'var(--surface)', border: '1px solid var(--surface-highest)', boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 40px rgba(157,0,255,0.1)', maxHeight: '85vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--surface-highest)', background: 'var(--surface-low)' }}>
          <span className="font-label text-[12px] uppercase tracking-[0.2em] font-bold" style={{ color: 'var(--primary)' }}>// Account Settings</span>
          <button onClick={onClose} style={{ color: 'var(--outline)', fontSize: 16 }}>✕</button>
        </div>
        <div className="p-4 space-y-5">

        {/* Change password */}
        <div className="border-t border-[#353534]/20 pt-4 space-y-2">
          <p className="text-[9px] font-bold font-label text-[#dfb7ff]/40 uppercase tracking-[0.3em] mb-3">Change Password</p>
          <input type="password" placeholder="Current password" value={curPw} onChange={(e) => setCurPw(e.target.value)} className={inputCls} />
          <input
            type="password"
            placeholder="New password (min 8 chars)"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && changePassword()}
            className={inputCls}
          />
          {pwMsg && (
            <p className={`text-xs font-label ${pwMsg.ok ? 'text-[#d5baff]' : 'text-[#ffb4ab]'}`}>// {pwMsg.text}</p>
          )}
          <button
            onClick={changePassword}
            disabled={!curPw || !newPw || pwSaving}
            className="w-full bg-[#9d00ff] hover:brightness-110 disabled:opacity-40 text-white text-sm font-label uppercase tracking-wider py-2 transition-all active:scale-95"
          >
            {pwSaving ? 'Saving...' : 'Change Password'}
          </button>
        </div>

        {/* Blocked users */}
        <div className="border-t border-[#353534]/20 pt-4 space-y-2">
          <p className="text-[9px] font-bold font-label text-[#dfb7ff]/40 uppercase tracking-[0.3em] mb-3">
            Blocked Users — {blocked.length}
          </p>
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {blocked.length === 0
              ? <p className="text-[#b8aac2] text-sm font-label">// No blocked users.</p>
              : blocked.map((b) => (
                <div key={b.userId} className="flex items-center justify-between bg-[#201f1f] px-3 py-2">
                  <span className="text-sm text-[#e5e2e1] font-label">@{b.username}</span>
                  <button
                    onClick={() => unblockUser(b.userId)}
                    className="text-xs font-label uppercase tracking-wider text-[#b8aac2] hover:text-[#d5baff] transition-colors"
                  >
                    Unblock
                  </button>
                </div>
              ))
            }
          </div>
        </div>

        {/* Danger zone */}
        <div className="border-t border-[#353534]/20 pt-4">
          <p className="text-[9px] font-bold font-label text-[#ffb4ab] uppercase tracking-[0.3em] mb-3">// Danger Zone</p>
          <p className="text-sm text-[#e5e2e1]/50 mb-3 font-body">
            Permanently deletes your account, all your owned rooms, and your messages.
            Type <span className="font-mono text-[#e5e2e1]">DELETE</span> to confirm.
          </p>
          <div className="flex gap-2">
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE"
              className="flex-1 bg-[#201f1f] text-[#e5e2e1] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#ffb4ab] border-0 font-mono"
            />
            <button
              onClick={deleteAccount}
              disabled={confirm !== 'DELETE' || deleting}
              className="bg-[#ffb4ab]/10 hover:bg-[#ffb4ab]/30 border border-[#ffb4ab]/30 disabled:opacity-40 text-[#ffb4ab] text-sm font-label uppercase tracking-wider px-4 py-2 transition-colors"
            >
              {deleting ? '...' : 'Delete'}
            </button>
          </div>
        </div>
        </div>{/* /p-4 space-y-5 */}
      </div>
    </div>
  )
}

// ── Room browser modal ────────────────────────────────────────────────────────
function RoomBrowser({
  onJoin, onClose, mode = 'public', privateRooms = [],
}: {
  onJoin: (room: Room) => void
  onClose: () => void
  mode?: 'public' | 'private'
  privateRooms?: Room[]
}) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newVis, setNewVis] = useState<'public' | 'private'>(mode)
  const [error, setError] = useState('')
  const [joiningId, setJoiningId] = useState<string | null>(null)

  useEffect(() => {
    if (mode === 'private') return
    roomsApi.list(1, search || undefined).then(setRooms).catch(console.error)
  }, [search, mode])

  async function join(room: Room) {
    setError('')
    setJoiningId(room.id)
    try {
      await roomsApi.join(room.id)
      onJoin(room)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room')
    } finally {
      setJoiningId(null)
    }
  }

  async function create() {
    if (!newName.trim()) return
    try {
      const room = await roomsApi.create(newName.trim(), newDesc, newVis)
      onJoin(room)
    } catch (err) { console.error(err) }
  }

  const inputCls = "w-full bg-[#201f1f] text-[#e5e2e1] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#9d00ff] border-0 font-body placeholder:text-[#b8aac2]/50"

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-lg" style={{ background: 'var(--surface)', border: '1px solid var(--surface-highest)', boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 40px rgba(157,0,255,0.1)', maxHeight: '85vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--surface-highest)', background: 'var(--surface-low)' }}>
          <span className="font-label text-[12px] uppercase tracking-[0.2em] font-bold" style={{ color: 'var(--primary)' }}>
            // {mode === 'private' ? 'My Private Rooms' : 'Browse Rooms'}
          </span>
          <button onClick={onClose} style={{ color: 'var(--outline)', fontSize: 16 }}>✕</button>
        </div>
        <div className="p-4">

        {mode === 'public' && (
          <input
            placeholder="Search rooms..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputCls} mb-3`}
          />
        )}

        {error && (
          <div className="bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 px-3 py-2 mb-4">
            <p className="text-[#ffb4ab] text-sm font-label">// {error}</p>
          </div>
        )}

        <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
          {(mode === 'private' ? privateRooms : rooms).length === 0 && (
            <p className="text-[#b8aac2] text-sm text-center py-4 font-label">
              // {mode === 'private' ? 'No private rooms yet.' : 'No public rooms yet.'}
            </p>
          )}
          {(mode === 'private' ? privateRooms : rooms).map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-[#201f1f] px-3 py-2">
              <div>
                <p className="text-[#e5e2e1] text-sm font-label"># {r.name}</p>
                {r.description && <p className="text-[#b8aac2] text-sm font-label">{r.description}</p>}
                {r.memberCount !== undefined && (
                  <p className="text-[#b8aac2]/50 text-xs font-label">{r.memberCount} member{r.memberCount !== 1 ? 's' : ''}</p>
                )}
              </div>
              <button
                onClick={() => join(r)}
                disabled={joiningId === r.id}
                className="text-xs font-label uppercase tracking-wider bg-[#9d00ff] hover:brightness-110 disabled:opacity-50 text-white px-3 py-1 transition-all active:scale-95"
              >
                {joiningId === r.id ? 'Joining...' : 'Join'}
              </button>
            </div>
          ))}
        </div>

        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="text-[#dfb7ff] hover:text-white text-sm font-label uppercase tracking-wider transition-colors"
          >
            + Create room
          </button>
        ) : (
          <div className="space-y-2">
            <input autoFocus placeholder="Room name" value={newName} onChange={(e) => setNewName(e.target.value)} className={inputCls} />
            <input placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className={inputCls} />
            {mode === 'public' && (
              <select
                value={newVis}
                onChange={(e) => setNewVis(e.target.value as 'public' | 'private')}
                className="w-full bg-[#201f1f] text-[#e5e2e1] px-3 py-2 text-sm outline-none border-0 font-label"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            )}
            <div className="flex gap-2">
              <button
                onClick={create}
                className="flex-1 bg-[#9d00ff] hover:brightness-110 text-white text-sm font-label uppercase tracking-wider py-2 transition-all active:scale-95"
              >
                Create
              </button>
              <button
                onClick={() => setCreating(false)}
                className="flex-1 bg-[#353534] hover:bg-[#353534]/80 text-[#e5e2e1]/60 text-sm font-label uppercase tracking-wider py-2 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        </div>{/* /p-4 */}
      </div>
    </div>
  )
}

// ── Friends modal ─────────────────────────────────────────────────────────────
function FriendsModal({ onClose, onFriendAdded }: { onClose: () => void; onFriendAdded: () => void }) {
  const [tab, setTab] = useState<'add' | 'requests'>('add')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
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
      await friendsApi.send(userId, message.trim() || undefined)
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

  const inputCls = "w-full bg-[#201f1f] text-[#e5e2e1] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#9d00ff] border-0 font-body placeholder:text-[#b8aac2]/50"

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-md" style={{ background: 'var(--surface)', border: '1px solid var(--surface-highest)', boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 40px rgba(157,0,255,0.1)', maxHeight: '85vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--surface-highest)', background: 'var(--surface-low)' }}>
          <span className="font-label text-[12px] uppercase tracking-[0.2em] font-bold" style={{ color: 'var(--primary)' }}>// Contacts</span>
          <button onClick={onClose} style={{ color: 'var(--outline)', fontSize: 16 }}>✕</button>
        </div>
        <div className="p-4 space-y-4">

        <div className="flex gap-0.5" style={{ borderBottom: '1px solid var(--surface-highest)', marginBottom: -1 }}>
          <button
            onClick={() => setTab('add')}
            className={`px-4 py-2 text-xs font-bold font-label uppercase tracking-wider transition-colors
              ${tab === 'add' ? 'text-[#dfb7ff] border-b-2 border-[#9d00ff]' : 'text-[#e5e2e1]/40 hover:text-[#dfb7ff]'}`}
          >
            Add Friend
          </button>
          <button
            onClick={() => setTab('requests')}
            className={`px-4 py-2 text-xs font-bold font-label uppercase tracking-wider transition-colors
              ${tab === 'requests' ? 'text-[#dfb7ff] border-b-2 border-[#9d00ff]' : 'text-[#e5e2e1]/40 hover:text-[#dfb7ff]'}`}
          >
            Requests {requests.length > 0 && `(${requests.length})`}
          </button>
        </div>

        {tab === 'add' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                autoFocus
                placeholder="Search by username..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                className={inputCls}
              />
              <button
                onClick={search}
                disabled={searching}
                className="bg-[#9d00ff] hover:brightness-110 disabled:opacity-40 text-white text-sm font-label uppercase tracking-wider px-4 py-2 transition-all active:scale-95"
              >
                {searching ? '...' : 'Search'}
              </button>
            </div>
            <input
              placeholder="Optional message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={200}
              className={inputCls}
            />
            <div className="space-y-1 max-h-44 overflow-y-auto">
              {results.length === 0 && query && !searching && (
                <p className="text-[#b8aac2] text-sm text-center py-3 font-label">// No users found.</p>
              )}
              {results.map((u) => (
                <div key={u.id} className="flex items-center justify-between bg-[#201f1f] px-3 py-2">
                  <div>
                    <p className="text-[#e5e2e1] text-sm font-label">{u.displayName}</p>
                    <p className="text-[#b8aac2] text-xs font-label">@{u.username}</p>
                  </div>
                  <button
                    onClick={() => sendRequest(u.id)}
                    disabled={sent.has(u.id)}
                    className="text-xs font-label uppercase tracking-wider bg-[#9d00ff] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1 transition-all"
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
              <p className="text-[#b8aac2] text-sm text-center py-4 font-label">// No pending requests.</p>
            )}
            {requests.map((r) => (
              <div key={r.userId} className="flex items-center justify-between bg-[#201f1f] px-3 py-2">
                <div className="min-w-0 mr-2">
                  <p className="text-[#e5e2e1] text-sm font-label">{r.displayName}</p>
                  <p className="text-[#b8aac2] text-xs font-label">@{r.username}</p>
                  {r.message && <p className="text-[#e5e2e1]/40 text-xs mt-0.5 italic truncate font-label">"{r.message}"</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => accept(r.userId)}
                    className="text-xs font-label uppercase tracking-wider bg-[#d5baff]/20 hover:bg-[#9d00ff] hover:text-white border border-[#d5baff]/30 text-[#d5baff] px-3 py-1 transition-all"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => decline(r.userId)}
                    className="text-xs font-label uppercase tracking-wider bg-[#353534] hover:bg-[#353534]/80 text-[#e5e2e1]/60 px-3 py-1 transition-colors"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>{/* /p-4 space-y-4 */}
      </div>
    </div>
  )
}

// ── Root chat app ─────────────────────────────────────────────────────────────
export default function ChatApp() {
  const { user, logout } = useAuth()
  const { setPresence, setAll } = usePresence()
  const { counts: unread, bump, clear } = useUnread()
  const [myRooms, setMyRooms] = useState<Room[]>([])
  const [dms, setDms] = useState<Dm[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [active, setActive] = useState<ActiveChat | null>(null)
  const activeRef = useRef<ActiveChat | null>(null)
  const [browsing, setBrowsing] = useState<false | 'public' | 'private'>(false)
  const [settings, setSettings] = useState(false)
  const [sessionsModal, setSessionsModal] = useState(false)
  const [friendsModal, setFriendsModal] = useState(false)
  const [messageStyle, setMessageStyle] = useState<'terminal' | 'bubble' | 'compact'>(() => {
    try { return (localStorage.getItem('hmc-msg-style') as 'terminal' | 'bubble' | 'compact') || 'terminal' } catch { return 'terminal' }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', 'purple')
    document.documentElement.setAttribute('data-crt', 'heavy')
  }, [])

  useEffect(() => {
    try { localStorage.setItem('hmc-msg-style', messageStyle) } catch {}
  }, [messageStyle])

  useEffect(() => { activeRef.current = active }, [active])

  handlers.onPresenceChanged = useCallback((userId: string, status) => {
    setPresence(userId, status)
  }, [setPresence])

  handlers.onRoomMessage = useCallback((roomId, _msg) => {
    if (activeRef.current?.id !== roomId) bump(roomId)
  }, [bump])
  handlers.onDmMessage = useCallback((chatId, _msg) => {
    if (activeRef.current?.id !== chatId) bump(chatId)
  }, [bump])

  useEffect(() => {
    connectHubs((presences) => setAll(presences)).catch(console.error)
    return () => { disconnectHubs().catch(console.error) }
  }, [setAll])

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
      setActive({ type: 'dm', id: dm.id, otherUserId: dm.otherUserId, otherUsername: dm.otherUsername, isFrozen: dm.isFrozen })
      clear(dm.id)
    } catch (err) {
      console.error('Could not open DM:', err)
    }
  }

  async function banFriend(userId: string) {
    try {
      await usersApi.banUser(userId)
      setFriends((f) => f.filter((x) => x.userId !== userId))
      setActive((a) => {
        if (a?.type === 'dm') {
          const dm = dms.find((d) => d.id === a.id)
          if (dm?.otherUserId === userId) return { ...a, isFrozen: true }
        }
        return a
      })
      setDms((d) => d.map((dm) => dm.otherUserId === userId ? { ...dm, isFrozen: true } : dm))
    } catch (err) { console.error('Ban failed:', err) }
  }

  const friendIds = new Set(friends.map((f) => f.userId))

  return (
    <div className="flex flex-col h-screen text-[#e5e2e1] overflow-hidden relative bg-[#0e0e0e] bg-grid crt-vignette">
      <div className="scanlines" />
      <TopNav
        user={user!}
        onPublicRooms={() => setBrowsing('public')}
        onPrivateRooms={() => setBrowsing('private')}
        onContacts={() => setFriendsModal(true)}
        onSessions={() => setSessionsModal(true)}
        onSettings={() => setSettings(true)}
        onSignOut={logout}
        messageStyle={messageStyle}
        onMessageStyleChange={setMessageStyle}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          myRooms={myRooms}
          dms={dms}
          friends={friends}
          active={active}
          onSelect={selectChat}
          onOpenDm={openDm}
          onBrowse={() => setBrowsing('public')}
          onSettings={() => setSettings(true)}
          onAddFriend={() => setFriendsModal(true)}
          onBanFriend={banFriend}
          unread={unread}
        />

        <main className="flex flex-1 overflow-hidden">
          {active ? (
            <ChatArea
              chat={active}
              userId={user!.id}
              friendIds={friendIds}
              messageStyle={messageStyle}
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
            <div className="flex-1 flex items-center justify-center bg-transparent">
              <div className="text-center">
                <div className="font-mono text-[11px] text-[#b8aac2] uppercase tracking-[0.2em] mb-2">// no channel selected</div>
                <p className="text-2xl font-bold font-headline text-[#dfb7ff] chromatic-aberration mb-1">
                  pick a room or DM
                </p>
                <div className="mt-6 h-px w-48 mx-auto bg-gradient-to-r from-transparent via-[#9d00ff]/50 to-transparent" />
                <button
                  onClick={() => setBrowsing('public')}
                  className="mt-6 bg-[#9d00ff] hover:brightness-110 text-white text-xs font-label uppercase tracking-[0.2em] px-6 py-2 transition-all active:scale-95"
                >
                  Browse rooms
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {browsing && (
        <RoomBrowser
          mode={browsing}
          privateRooms={browsing === 'private' ? myRooms.filter((r) => r.visibility === 'private') : undefined}
          onJoin={addRoom}
          onClose={() => setBrowsing(false)}
        />
      )}
      {settings && <AccountModal onClose={() => setSettings(false)} />}
      {sessionsModal && <SessionsModal onClose={() => setSessionsModal(false)} />}
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
