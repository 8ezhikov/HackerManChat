using System.Security.Claims;
using HackerManChat.Api.Data;
using HackerManChat.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace HackerManChat.Api.Messages;

public static class UnreadEndpoints
{
    public static IEndpointRouteBuilder MapUnreadEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/unread").RequireAuthorization();
        g.MapGet("", GetUnread);
        g.MapPost("/rooms/{id:guid}/read", MarkRoomRead);
        g.MapPost("/dms/{id:guid}/read", MarkDmRead);
        return app;
    }

    private static async Task<IResult> GetUnread(ClaimsPrincipal principal, AppDbContext db)
    {
        var userId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var roomIds = await db.RoomMembers
            .Where(m => m.UserId == userId)
            .Select(m => m.RoomId)
            .ToListAsync();

        var dmIds = await db.PersonalChats
            .Where(pc => pc.User1Id == userId || pc.User2Id == userId)
            .Select(pc => pc.Id)
            .ToListAsync();

        var markers = await db.UnreadMarkers
            .Where(m => m.UserId == userId)
            .ToDictionaryAsync(m => (m.ChatKind, m.ChatId));

        var roomCounts = await Task.WhenAll(roomIds.Select(async roomId =>
        {
            var since = markers.TryGetValue((ChatKind.Room, roomId), out var m) ? m.LastSeenAt : DateTime.MinValue;
            var count = await db.Messages.CountAsync(msg =>
                msg.RoomId == roomId && msg.AuthorId != userId && !msg.IsDeleted && msg.CreatedAt > since);
            return new UnreadCountDto(roomId, count);
        }));

        var dmCounts = await Task.WhenAll(dmIds.Select(async chatId =>
        {
            var since = markers.TryGetValue((ChatKind.Dm, chatId), out var m) ? m.LastSeenAt : DateTime.MinValue;
            var count = await db.Messages.CountAsync(msg =>
                msg.PersonalChatId == chatId && msg.AuthorId != userId && !msg.IsDeleted && msg.CreatedAt > since);
            return new UnreadCountDto(chatId, count);
        }));

        return Results.Ok(new
        {
            rooms = roomCounts.Where(r => r.Count > 0),
            dms = dmCounts.Where(d => d.Count > 0),
        });
    }

    private static async Task<IResult> MarkRoomRead(Guid id, ClaimsPrincipal principal, AppDbContext db)
    {
        var userId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (!await db.RoomMembers.AnyAsync(m => m.RoomId == id && m.UserId == userId))
            return Results.Forbid();

        await UpsertMarker(db, userId, ChatKind.Room, id);
        return Results.NoContent();
    }

    private static async Task<IResult> MarkDmRead(Guid id, ClaimsPrincipal principal, AppDbContext db)
    {
        var userId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var chat = await db.PersonalChats.FindAsync(id);
        if (chat == null || (chat.User1Id != userId && chat.User2Id != userId))
            return Results.Forbid();

        await UpsertMarker(db, userId, ChatKind.Dm, id);
        return Results.NoContent();
    }

    private static async Task UpsertMarker(AppDbContext db, Guid userId, ChatKind kind, Guid chatId)
    {
        var marker = await db.UnreadMarkers
            .FirstOrDefaultAsync(m => m.UserId == userId && m.ChatKind == kind && m.ChatId == chatId);
        if (marker == null)
        {
            db.UnreadMarkers.Add(new UnreadMarker { UserId = userId, ChatKind = kind, ChatId = chatId, LastSeenAt = DateTime.UtcNow });
        }
        else
        {
            marker.LastSeenAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
    }
}

public record UnreadCountDto(Guid Id, int Count);
