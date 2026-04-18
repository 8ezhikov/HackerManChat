using System.Security.Claims;
using HackerManChat.Api.Data;
using HackerManChat.Api.Data.Entities;
using HackerManChat.Api.Friends;
using HackerManChat.Api.Hubs;
using HackerManChat.Api.Messages;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace HackerManChat.Api.Attachments;

public static class AttachmentEndpoints
{
    private const long MaxImageBytes = 3 * 1024 * 1024;
    private const long MaxFileBytes = 20 * 1024 * 1024;

    public static IEndpointRouteBuilder MapAttachmentEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api").RequireAuthorization();

        g.MapPost("rooms/{roomId:guid}/upload", UploadToRoom).DisableAntiforgery();
        g.MapPost("dms/{chatId:guid}/upload", UploadToDm).DisableAntiforgery();
        g.MapGet("attachments/{id:guid}", Download);

        return app;
    }

    private static async Task<IResult> UploadToRoom(
        Guid roomId,
        IFormFile file,
        [FromForm] string? content,
        ClaimsPrincipal principal,
        AppDbContext db,
        IHubContext<ChatHub> hub,
        IConfiguration config)
    {
        var myId = UserId(principal);
        if (!await db.RoomMembers.AnyAsync(m => m.RoomId == roomId && m.UserId == myId))
            return Results.Forbid();

        var sizeError = ValidateFile(file);
        if (sizeError != null) return sizeError;

        var storedName = await SaveFileAsync(file, config);

        var msg = new Message { RoomId = roomId, AuthorId = myId, Content = content?.Trim() ?? string.Empty };
        db.Messages.Add(msg);
        await db.SaveChangesAsync();

        db.Attachments.Add(new Attachment
        {
            MessageId = msg.Id,
            OriginalFileName = file.FileName,
            StoredFileName = storedName,
            SizeBytes = file.Length,
            ContentType = file.ContentType,
        });
        await db.SaveChangesAsync();

        await db.Entry(msg).Reference(m => m.Author).LoadAsync();
        await db.Entry(msg).Collection(m => m.Attachments).LoadAsync();

        var dto = msg.ToDto();
        await hub.Clients.Group(HubConstants.RoomGroup(roomId))
            .SendAsync(HubConstants.RoomMessageReceived, roomId, dto);

        return Results.Created($"/api/rooms/{roomId}/messages/{msg.Id}", dto);
    }

    private static async Task<IResult> UploadToDm(
        Guid chatId,
        IFormFile file,
        [FromForm] string? content,
        ClaimsPrincipal principal,
        AppDbContext db,
        IHubContext<ChatHub> hub,
        IConfiguration config)
    {
        var myId = UserId(principal);
        var chat = await db.PersonalChats.FindAsync(chatId);
        if (chat == null || !IsParticipant(chat, myId)) return Results.Forbid();
        if (chat.IsFrozen) return Results.Forbid();

        var otherId = chat.User1Id == myId ? chat.User2Id : chat.User1Id;
        if (!await AreFriendsAsync(db, myId, otherId)) return Results.Forbid();
        if (await FriendEndpoints.IsBannedEitherWayAsync(db, myId, otherId)) return Results.Forbid();

        var sizeError = ValidateFile(file);
        if (sizeError != null) return sizeError;

        var storedName = await SaveFileAsync(file, config);

        var msg = new Message { PersonalChatId = chatId, AuthorId = myId, Content = content?.Trim() ?? string.Empty };
        db.Messages.Add(msg);
        await db.SaveChangesAsync();

        db.Attachments.Add(new Attachment
        {
            MessageId = msg.Id,
            OriginalFileName = file.FileName,
            StoredFileName = storedName,
            SizeBytes = file.Length,
            ContentType = file.ContentType,
        });
        await db.SaveChangesAsync();

        await db.Entry(msg).Reference(m => m.Author).LoadAsync();
        await db.Entry(msg).Collection(m => m.Attachments).LoadAsync();

        var dto = msg.ToDto();
        await hub.Clients.Group(HubConstants.UserGroup(chat.User1Id))
            .SendAsync(HubConstants.DmMessageReceived, chatId, dto);
        await hub.Clients.Group(HubConstants.UserGroup(chat.User2Id))
            .SendAsync(HubConstants.DmMessageReceived, chatId, dto);

        return Results.Created($"/api/dms/{chatId}/messages/{msg.Id}", dto);
    }

    private static async Task<IResult> Download(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        IConfiguration config)
    {
        var myId = UserId(principal);
        var attachment = await db.Attachments
            .Include(a => a.Message)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (attachment == null) return Results.NotFound();

        var msg = attachment.Message;
        if (msg.RoomId.HasValue)
        {
            if (!await db.RoomMembers.AnyAsync(m => m.RoomId == msg.RoomId && m.UserId == myId))
                return Results.Forbid();
        }
        else if (msg.PersonalChatId.HasValue)
        {
            var chat = await db.PersonalChats.FindAsync(msg.PersonalChatId.Value);
            if (chat == null || !IsParticipant(chat, myId)) return Results.Forbid();
        }
        else
        {
            return Results.Forbid();
        }

        var basePath = config["FileStorage:Path"] ?? "/data/chatfiles";
        var fullPath = Path.Combine(basePath, attachment.StoredFileName);
        if (!File.Exists(fullPath)) return Results.NotFound();

        var stream = File.OpenRead(fullPath);
        return Results.File(stream, attachment.ContentType, attachment.OriginalFileName);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static IResult? ValidateFile(IFormFile file)
    {
        if (file.Length == 0) return Results.BadRequest(new { error = "File is empty." });
        var isImage = file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase);
        var limit = isImage ? MaxImageBytes : MaxFileBytes;
        if (file.Length > limit)
            return Results.BadRequest(new { error = isImage ? "Image must be ≤ 3 MB." : "File must be ≤ 20 MB." });
        return null;
    }

    private static async Task<string> SaveFileAsync(IFormFile file, IConfiguration config)
    {
        var basePath = config["FileStorage:Path"] ?? "/data/chatfiles";
        Directory.CreateDirectory(basePath);
        var storedName = $"{Guid.NewGuid()}{Path.GetExtension(file.FileName)}";
        using var fs = File.Create(Path.Combine(basePath, storedName));
        await file.CopyToAsync(fs);
        return storedName;
    }

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
