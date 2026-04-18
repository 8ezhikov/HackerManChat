using HackerManChat.Api.Data;
using HackerManChat.Api.Data.Entities;
using HackerManChat.Api.Friends;
using HackerManChat.Api.Messages;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace HackerManChat.Api.Hubs;

[Authorize]
public class ChatHub(AppDbContext db) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var userId = GetUserId();
        await Groups.AddToGroupAsync(Context.ConnectionId, HubConstants.UserGroup(userId));

        var roomIds = await db.RoomMembers
            .Where(m => m.UserId == userId)
            .Select(m => m.RoomId)
            .ToListAsync();

        foreach (var roomId in roomIds)
            await Groups.AddToGroupAsync(Context.ConnectionId, HubConstants.RoomGroup(roomId));

        await base.OnConnectedAsync();
    }

    // Called by the client after joining a room mid-session (OnConnectedAsync only catches rooms joined before connect)
    public async Task JoinRoomGroup(Guid roomId)
    {
        var myId = GetUserId();
        if (!await db.RoomMembers.AnyAsync(m => m.RoomId == roomId && m.UserId == myId))
            throw new HubException("Not a member of this room.");
        await Groups.AddToGroupAsync(Context.ConnectionId, HubConstants.RoomGroup(roomId));
    }

    // ── Room messages ─────────────────────────────────────────────────────────

    public async Task SendRoomMessage(Guid roomId, string content, Guid? replyToId = null)
    {
        var myId = GetUserId();
        if (!await db.RoomMembers.AnyAsync(m => m.RoomId == roomId && m.UserId == myId))
            throw new HubException("Not a member of this room.");

        if (string.IsNullOrWhiteSpace(content) || content.Length > 3072)
            throw new HubException("Message must be 1–3072 characters.");

        if (replyToId.HasValue)
        {
            var reply = await db.Messages.FindAsync(replyToId.Value);
            if (reply == null || reply.RoomId != roomId)
                throw new HubException("Invalid replyToId.");
        }

        var msg = new Message { RoomId = roomId, AuthorId = myId, Content = content, ReplyToId = replyToId };
        db.Messages.Add(msg);
        await db.SaveChangesAsync();
        await db.Entry(msg).Reference(m => m.Author).LoadAsync();
        if (msg.ReplyToId.HasValue)
        {
            await db.Entry(msg).Reference(m => m.ReplyTo).LoadAsync();
            if (msg.ReplyTo != null) await db.Entry(msg.ReplyTo).Reference(r => r.Author).LoadAsync();
        }

        await Clients.Group(HubConstants.RoomGroup(roomId))
            .SendAsync(HubConstants.RoomMessageReceived, roomId, msg.ToDto());
    }

    public async Task EditRoomMessage(Guid roomId, Guid messageId, string content)
    {
        var myId = GetUserId();
        var msg = await db.Messages.Include(m => m.Author)
            .FirstOrDefaultAsync(m => m.Id == messageId && m.RoomId == roomId);
        if (msg == null) throw new HubException("Message not found.");
        if (msg.AuthorId != myId) throw new HubException("Not your message.");
        if (msg.IsDeleted) throw new HubException("Cannot edit a deleted message.");

        if (string.IsNullOrWhiteSpace(content) || content.Length > 3072)
            throw new HubException("Message must be 1–3072 characters.");

        msg.Content = content;
        msg.EditedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await Clients.Group(HubConstants.RoomGroup(roomId))
            .SendAsync(HubConstants.RoomMessageEdited, roomId, msg.ToDto());
    }

    public async Task DeleteRoomMessage(Guid roomId, Guid messageId)
    {
        var myId = GetUserId();
        var msg = await db.Messages.FirstOrDefaultAsync(m => m.Id == messageId && m.RoomId == roomId);
        if (msg == null) throw new HubException("Message not found.");
        if (!await db.RoomMembers.AnyAsync(m => m.RoomId == roomId && m.UserId == myId))
            throw new HubException("Not a member of this room.");

        var isAdmin = await db.RoomMembers
            .AnyAsync(m => m.RoomId == roomId && m.UserId == myId && m.Role == RoomMemberRole.Admin);
        if (msg.AuthorId != myId && !isAdmin)
            throw new HubException("Not authorized to delete this message.");

        msg.IsDeleted = true;
        await db.SaveChangesAsync();

        await Clients.Group(HubConstants.RoomGroup(roomId))
            .SendAsync(HubConstants.RoomMessageDeleted, roomId, messageId);
    }

    // ── DM messages ───────────────────────────────────────────────────────────

    public async Task SendDmMessage(Guid chatId, string content, Guid? replyToId = null)
    {
        var myId = GetUserId();
        var chat = await db.PersonalChats.FindAsync(chatId)
            ?? throw new HubException("Chat not found.");
        if (!IsParticipant(chat, myId)) throw new HubException("Not a participant.");
        if (chat.IsFrozen) throw new HubException("This conversation is frozen.");

        var otherId = chat.User1Id == myId ? chat.User2Id : chat.User1Id;
        if (!await AreFriendsAsync(myId, otherId)) throw new HubException("Not friends.");
        if (await FriendEndpoints.IsBannedEitherWayAsync(db, myId, otherId)) throw new HubException("Blocked.");

        if (string.IsNullOrWhiteSpace(content) || content.Length > 3072)
            throw new HubException("Message must be 1–3072 characters.");

        if (replyToId.HasValue)
        {
            var reply = await db.Messages.FindAsync(replyToId.Value);
            if (reply == null || reply.PersonalChatId != chatId)
                throw new HubException("Invalid replyToId.");
        }

        var msg = new Message { PersonalChatId = chatId, AuthorId = myId, Content = content, ReplyToId = replyToId };
        db.Messages.Add(msg);
        await db.SaveChangesAsync();
        await db.Entry(msg).Reference(m => m.Author).LoadAsync();
        if (msg.ReplyToId.HasValue)
        {
            await db.Entry(msg).Reference(m => m.ReplyTo).LoadAsync();
            if (msg.ReplyTo != null) await db.Entry(msg.ReplyTo).Reference(r => r.Author).LoadAsync();
        }

        var dto = msg.ToDto();
        await Clients.Group(HubConstants.UserGroup(chat.User1Id)).SendAsync(HubConstants.DmMessageReceived, chatId, dto);
        await Clients.Group(HubConstants.UserGroup(chat.User2Id)).SendAsync(HubConstants.DmMessageReceived, chatId, dto);
    }

    public async Task EditDmMessage(Guid chatId, Guid messageId, string content)
    {
        var myId = GetUserId();
        var chat = await db.PersonalChats.FindAsync(chatId)
            ?? throw new HubException("Chat not found.");
        if (!IsParticipant(chat, myId)) throw new HubException("Not a participant.");

        var msg = await db.Messages.Include(m => m.Author)
            .FirstOrDefaultAsync(m => m.Id == messageId && m.PersonalChatId == chatId)
            ?? throw new HubException("Message not found.");
        if (msg.AuthorId != myId) throw new HubException("Not your message.");
        if (msg.IsDeleted) throw new HubException("Cannot edit a deleted message.");

        if (string.IsNullOrWhiteSpace(content) || content.Length > 3072)
            throw new HubException("Message must be 1–3072 characters.");

        msg.Content = content;
        msg.EditedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var dto = msg.ToDto();
        await Clients.Group(HubConstants.UserGroup(chat.User1Id)).SendAsync(HubConstants.DmMessageEdited, chatId, dto);
        await Clients.Group(HubConstants.UserGroup(chat.User2Id)).SendAsync(HubConstants.DmMessageEdited, chatId, dto);
    }

    public async Task DeleteDmMessage(Guid chatId, Guid messageId)
    {
        var myId = GetUserId();
        var chat = await db.PersonalChats.FindAsync(chatId)
            ?? throw new HubException("Chat not found.");
        if (!IsParticipant(chat, myId)) throw new HubException("Not a participant.");

        var msg = await db.Messages.FirstOrDefaultAsync(m => m.Id == messageId && m.PersonalChatId == chatId)
            ?? throw new HubException("Message not found.");
        if (msg.AuthorId != myId) throw new HubException("Not your message.");

        msg.IsDeleted = true;
        await db.SaveChangesAsync();

        await Clients.Group(HubConstants.UserGroup(chat.User1Id)).SendAsync(HubConstants.DmMessageDeleted, chatId, messageId);
        await Clients.Group(HubConstants.UserGroup(chat.User2Id)).SendAsync(HubConstants.DmMessageDeleted, chatId, messageId);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Guid GetUserId() => Guid.Parse(Context.UserIdentifier!);

    private static bool IsParticipant(PersonalChat pc, Guid userId) =>
        pc.User1Id == userId || pc.User2Id == userId;

    private Task<bool> AreFriendsAsync(Guid a, Guid b) =>
        db.Friendships.AnyAsync(f =>
            f.Status == FriendshipStatus.Accepted &&
            ((f.RequesterId == a && f.AddresseeId == b) ||
             (f.RequesterId == b && f.AddresseeId == a)));
}
