using System.Security.Claims;
using HackerManChat.Api.Data;
using HackerManChat.Api.Data.Entities;
using HackerManChat.Api.Hubs;
using HackerManChat.Api.Messages;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace HackerManChat.Api.Rooms;

public static class RoomMessageEndpoints
{
    public static IEndpointRouteBuilder MapRoomMessageEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/rooms/{id:guid}/messages").RequireAuthorization();

        g.MapGet("", GetMessages);
        g.MapPost("", SendMessage);
        g.MapPatch("{msgId:guid}", EditMessage);
        g.MapDelete("{msgId:guid}", DeleteMessage);

        return app;
    }

    private static async Task<IResult> GetMessages(
        Guid id, ClaimsPrincipal principal, AppDbContext db,
        DateTime? before = null, Guid? beforeId = null, int limit = 50)
    {
        var myId = UserId(principal);
        if (!await IsMemberAsync(db, id, myId)) return Results.Forbid();

        limit = Math.Clamp(limit, 1, 100);

        var query = db.Messages
            .Where(m => m.RoomId == id && !m.IsDeleted)
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

    private static async Task<IResult> SendMessage(
        Guid id, SendMessageBody body, ClaimsPrincipal principal,
        AppDbContext db, IHubContext<ChatHub> hub)
    {
        var myId = UserId(principal);
        if (!await IsMemberAsync(db, id, myId)) return Results.Forbid();

        if (string.IsNullOrWhiteSpace(body.Content) || body.Content.Length > 3072)
            return Results.BadRequest(new { error = "Message must be 1–3072 characters." });

        if (body.ReplyToId.HasValue)
        {
            var reply = await db.Messages.FindAsync(body.ReplyToId.Value);
            if (reply == null || reply.RoomId != id)
                return Results.BadRequest(new { error = "Invalid replyToId." });
        }

        var msg = new Message { RoomId = id, AuthorId = myId, Content = body.Content, ReplyToId = body.ReplyToId };
        db.Messages.Add(msg);
        await db.SaveChangesAsync();
        await db.Entry(msg).Reference(m => m.Author).LoadAsync();

        var dto = msg.ToDto();
        await hub.Clients.Group(HubConstants.RoomGroup(id))
            .SendAsync(HubConstants.RoomMessageReceived, id, dto);

        return Results.Created($"/api/rooms/{id}/messages/{msg.Id}", dto);
    }

    private static async Task<IResult> EditMessage(
        Guid id, Guid msgId, EditMessageBody body, ClaimsPrincipal principal,
        AppDbContext db, IHubContext<ChatHub> hub)
    {
        var myId = UserId(principal);
        var msg = await db.Messages.Include(m => m.Author)
            .FirstOrDefaultAsync(m => m.Id == msgId && m.RoomId == id);
        if (msg == null) return Results.NotFound();
        if (!await IsMemberAsync(db, id, myId)) return Results.Forbid();
        if (msg.AuthorId != myId) return Results.Forbid();
        if (msg.IsDeleted) return Results.BadRequest(new { error = "Cannot edit a deleted message." });

        if (string.IsNullOrWhiteSpace(body.Content) || body.Content.Length > 3072)
            return Results.BadRequest(new { error = "Message must be 1–3072 characters." });

        msg.Content = body.Content;
        msg.EditedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var dto = msg.ToDto();
        await hub.Clients.Group(HubConstants.RoomGroup(id))
            .SendAsync(HubConstants.RoomMessageEdited, id, dto);

        return Results.Ok(dto);
    }

    private static async Task<IResult> DeleteMessage(
        Guid id, Guid msgId, ClaimsPrincipal principal,
        AppDbContext db, IHubContext<ChatHub> hub)
    {
        var myId = UserId(principal);
        var msg = await db.Messages.FirstOrDefaultAsync(m => m.Id == msgId && m.RoomId == id);
        if (msg == null) return Results.NotFound();
        if (!await IsMemberAsync(db, id, myId)) return Results.Forbid();

        // Author or room admin can delete
        var isAdmin = await db.RoomMembers
            .AnyAsync(m => m.RoomId == id && m.UserId == myId && m.Role == RoomMemberRole.Admin);
        if (msg.AuthorId != myId && !isAdmin) return Results.Forbid();

        msg.IsDeleted = true;
        await db.SaveChangesAsync();

        await hub.Clients.Group(HubConstants.RoomGroup(id))
            .SendAsync(HubConstants.RoomMessageDeleted, id, msgId);

        return Results.NoContent();
    }

    private static Guid UserId(ClaimsPrincipal p) =>
        Guid.Parse(p.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private static Task<bool> IsMemberAsync(AppDbContext db, Guid roomId, Guid userId) =>
        db.RoomMembers.AnyAsync(m => m.RoomId == roomId && m.UserId == userId);
}
