using System.Security.Claims;
using HackerManChat.Api.Data;
using HackerManChat.Api.Data.Entities;
using HackerManChat.Api.Friends;
using HackerManChat.Api.Hubs;
using HackerManChat.Api.Messages;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace HackerManChat.Api.DMs;

public static class DmEndpoints
{
    public static IEndpointRouteBuilder MapDmEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/dms").RequireAuthorization();

        g.MapPost("", OpenDm);
        g.MapGet("", ListDms);
        g.MapGet("{id:guid}", GetDm);

        g.MapPost("{id:guid}/messages", SendMessage);
        g.MapGet("{id:guid}/messages", GetMessages);
        g.MapPatch("{id:guid}/messages/{msgId:guid}", EditMessage);
        g.MapDelete("{id:guid}/messages/{msgId:guid}", DeleteMessage);

        return app;
    }

    // ── Conversations ─────────────────────────────────────────────────────────

    private static async Task<IResult> OpenDm(
        OpenDmBody body, ClaimsPrincipal principal, AppDbContext db)
    {
        var myId = UserId(principal);
        if (body.UserId == myId) return Results.BadRequest(new { error = "Cannot DM yourself." });

        var target = await db.Users.FindAsync(body.UserId);
        if (target == null) return Results.NotFound();

        if (!await AreFriendsAsync(db, myId, body.UserId))
            return Results.Forbid();
        if (await FriendEndpoints.IsBannedEitherWayAsync(db, myId, body.UserId))
            return Results.Forbid();

        var (u1, u2) = myId < body.UserId ? (myId, body.UserId) : (body.UserId, myId);
        var existing = await db.PersonalChats
            .Include(pc => pc.User1)
            .Include(pc => pc.User2)
            .FirstOrDefaultAsync(pc => pc.User1Id == u1 && pc.User2Id == u2);

        if (existing != null)
            return Results.Ok(existing.ToDto(myId));

        var chat = new PersonalChat { User1Id = u1, User2Id = u2 };
        db.PersonalChats.Add(chat);
        await db.SaveChangesAsync();

        await db.Entry(chat).Reference(c => c.User1).LoadAsync();
        await db.Entry(chat).Reference(c => c.User2).LoadAsync();
        return Results.Created($"/api/dms/{chat.Id}", chat.ToDto(myId));
    }

    private static async Task<IResult> ListDms(ClaimsPrincipal principal, AppDbContext db)
    {
        var myId = UserId(principal);
        var chats = await db.PersonalChats
            .Where(pc => pc.User1Id == myId || pc.User2Id == myId)
            .Include(pc => pc.User1)
            .Include(pc => pc.User2)
            .OrderByDescending(pc => pc.CreatedAt)
            .Select(pc => pc.ToDto(myId))
            .ToListAsync();
        return Results.Ok(chats);
    }

    private static async Task<IResult> GetDm(Guid id, ClaimsPrincipal principal, AppDbContext db)
    {
        var myId = UserId(principal);
        var chat = await db.PersonalChats
            .Include(pc => pc.User1)
            .Include(pc => pc.User2)
            .FirstOrDefaultAsync(pc => pc.Id == id);
        if (chat == null) return Results.NotFound();
        if (!IsParticipant(chat, myId)) return Results.Forbid();
        return Results.Ok(chat.ToDto(myId));
    }

    // ── Messages ──────────────────────────────────────────────────────────────

    private static async Task<IResult> SendMessage(
        Guid id, SendMessageBody body, ClaimsPrincipal principal,
        AppDbContext db, IHubContext<ChatHub> hub)
    {
        var myId = UserId(principal);
        var chat = await db.PersonalChats.FindAsync(id);
        if (chat == null) return Results.NotFound();
        if (!IsParticipant(chat, myId)) return Results.Forbid();
        if (chat.IsFrozen) return Results.Forbid();

        var otherId = chat.User1Id == myId ? chat.User2Id : chat.User1Id;
        if (!await AreFriendsAsync(db, myId, otherId))
            return Results.Forbid();
        if (await FriendEndpoints.IsBannedEitherWayAsync(db, myId, otherId))
            return Results.Forbid();

        if (string.IsNullOrWhiteSpace(body.Content) || body.Content.Length > 3072)
            return Results.BadRequest(new { error = "Message must be 1–3072 characters." });

        if (body.ReplyToId.HasValue)
        {
            var replyTarget = await db.Messages.FindAsync(body.ReplyToId.Value);
            if (replyTarget == null || replyTarget.PersonalChatId != id)
                return Results.BadRequest(new { error = "Invalid replyToId." });
        }

        var msg = new Message { PersonalChatId = id, AuthorId = myId, Content = body.Content, ReplyToId = body.ReplyToId };
        db.Messages.Add(msg);
        await db.SaveChangesAsync();
        await db.Entry(msg).Reference(m => m.Author).LoadAsync();

        var dto = msg.ToDto();
        await hub.Clients.Group(HubConstants.UserGroup(chat.User1Id))
            .SendAsync(HubConstants.DmMessageReceived, id, dto);
        await hub.Clients.Group(HubConstants.UserGroup(chat.User2Id))
            .SendAsync(HubConstants.DmMessageReceived, id, dto);

        return Results.Created($"/api/dms/{id}/messages/{msg.Id}", dto);
    }

    private static async Task<IResult> GetMessages(
        Guid id, ClaimsPrincipal principal, AppDbContext db,
        DateTime? before = null, Guid? beforeId = null, int limit = 50)
    {
        var myId = UserId(principal);
        var chat = await db.PersonalChats.FindAsync(id);
        if (chat == null) return Results.NotFound();
        if (!IsParticipant(chat, myId)) return Results.Forbid();

        limit = Math.Clamp(limit, 1, 100);

        var query = db.Messages
            .Where(m => m.PersonalChatId == id && !m.IsDeleted)
            .Include(m => m.Author)
            .AsQueryable();

        if (before.HasValue && beforeId.HasValue)
            query = query.Where(m => m.CreatedAt < before.Value ||
                                     (m.CreatedAt == before.Value && m.Id < beforeId.Value));

        var messages = await query
            .OrderByDescending(m => m.CreatedAt)
            .ThenByDescending(m => m.Id)
            .Take(limit)
            .Select(m => m.ToDto())
            .ToListAsync();

        return Results.Ok(messages);
    }

    private static async Task<IResult> EditMessage(
        Guid id, Guid msgId, EditMessageBody body, ClaimsPrincipal principal,
        AppDbContext db, IHubContext<ChatHub> hub)
    {
        var myId = UserId(principal);
        var chat = await db.PersonalChats.FindAsync(id);
        if (chat == null || !IsParticipant(chat, myId)) return Results.Forbid();

        var msg = await db.Messages.Include(m => m.Author)
            .FirstOrDefaultAsync(m => m.Id == msgId && m.PersonalChatId == id);
        if (msg == null) return Results.NotFound();
        if (msg.AuthorId != myId) return Results.Forbid();
        if (msg.IsDeleted) return Results.BadRequest(new { error = "Cannot edit a deleted message." });

        if (string.IsNullOrWhiteSpace(body.Content) || body.Content.Length > 3072)
            return Results.BadRequest(new { error = "Message must be 1–3072 characters." });

        msg.Content = body.Content;
        msg.EditedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var dto = msg.ToDto();
        await hub.Clients.Group(HubConstants.UserGroup(chat.User1Id))
            .SendAsync(HubConstants.DmMessageEdited, id, dto);
        await hub.Clients.Group(HubConstants.UserGroup(chat.User2Id))
            .SendAsync(HubConstants.DmMessageEdited, id, dto);

        return Results.Ok(dto);
    }

    private static async Task<IResult> DeleteMessage(
        Guid id, Guid msgId, ClaimsPrincipal principal,
        AppDbContext db, IHubContext<ChatHub> hub)
    {
        var myId = UserId(principal);
        var chat = await db.PersonalChats.FindAsync(id);
        if (chat == null || !IsParticipant(chat, myId)) return Results.Forbid();

        var msg = await db.Messages.FirstOrDefaultAsync(m => m.Id == msgId && m.PersonalChatId == id);
        if (msg == null) return Results.NotFound();
        if (msg.AuthorId != myId) return Results.Forbid();

        msg.IsDeleted = true;
        await db.SaveChangesAsync();

        await hub.Clients.Group(HubConstants.UserGroup(chat.User1Id))
            .SendAsync(HubConstants.DmMessageDeleted, id, msgId);
        await hub.Clients.Group(HubConstants.UserGroup(chat.User2Id))
            .SendAsync(HubConstants.DmMessageDeleted, id, msgId);

        return Results.NoContent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static Guid UserId(ClaimsPrincipal p) =>
        Guid.Parse(p.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private static bool IsParticipant(PersonalChat pc, Guid userId) =>
        pc.User1Id == userId || pc.User2Id == userId;

    private static Task<bool> AreFriendsAsync(AppDbContext db, Guid a, Guid b) =>
        db.Friendships.AnyAsync(f =>
            f.Status == FriendshipStatus.Accepted &&
            ((f.RequesterId == a && f.AddresseeId == b) ||
             (f.RequesterId == b && f.AddresseeId == a)));
}
