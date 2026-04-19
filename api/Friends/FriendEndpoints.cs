using System.Security.Claims;
using HackerManChat.Api.Data;
using HackerManChat.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace HackerManChat.Api.Friends;

public static class FriendEndpoints
{
    public static IEndpointRouteBuilder MapFriendEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api").RequireAuthorization();

        // Friend requests
        g.MapPost("friends/requests", SendRequest);
        g.MapGet("friends/requests", GetIncomingRequests);
        g.MapPost("friends/requests/{requesterId:guid}/accept", AcceptRequest);
        g.MapDelete("friends/requests/{requesterId:guid}", DeclineOrCancelRequest);

        // Friends list + unfriend
        g.MapGet("friends", ListFriends);
        g.MapDelete("friends/{userId:guid}", Unfriend);

        // User bans
        g.MapGet("users/bans", GetBans);
        g.MapPost("users/bans/{targetId:guid}", BanUser);
        g.MapDelete("users/bans/{targetId:guid}", UnbanUser);

        return app;
    }

    // ── Friend requests ───────────────────────────────────────────────────────

    private static async Task<IResult> SendRequest(
        SendFriendRequestBody body, ClaimsPrincipal principal, AppDbContext db)
    {
        var myId = UserId(principal);
        if (body.UserId == myId) return Results.BadRequest(new { error = "Cannot add yourself." });

        var target = await db.Users.FindAsync(body.UserId);
        if (target == null) return Results.NotFound();

        if (await IsBannedEitherWayAsync(db, myId, body.UserId))
            return Results.Forbid();

        var existing = await db.Friendships.FirstOrDefaultAsync(f =>
            (f.RequesterId == myId && f.AddresseeId == body.UserId) ||
            (f.RequesterId == body.UserId && f.AddresseeId == myId));

        if (existing != null)
            return Results.Conflict(new { error = existing.Status == FriendshipStatus.Accepted ? "Already friends." : "Request already exists." });

        db.Friendships.Add(new Friendship { RequesterId = myId, AddresseeId = body.UserId, Message = body.Message });
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> GetIncomingRequests(
        ClaimsPrincipal principal, AppDbContext db)
    {
        var myId = UserId(principal);
        var requests = await db.Friendships
            .Where(f => f.AddresseeId == myId && f.Status == FriendshipStatus.Pending)
            .Include(f => f.Requester)
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => f.ToRequestDto(f.Requester))
            .ToListAsync();
        return Results.Ok(requests);
    }

    private static async Task<IResult> AcceptRequest(
        Guid requesterId, ClaimsPrincipal principal, AppDbContext db)
    {
        var myId = UserId(principal);
        var f = await db.Friendships.FirstOrDefaultAsync(f =>
            f.RequesterId == requesterId && f.AddresseeId == myId && f.Status == FriendshipStatus.Pending);
        if (f == null) return Results.NotFound();

        f.Status = FriendshipStatus.Accepted;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> DeclineOrCancelRequest(
        Guid requesterId, ClaimsPrincipal principal, AppDbContext db)
    {
        var myId = UserId(principal);
        // Addressee declining OR requester cancelling
        var f = await db.Friendships.FirstOrDefaultAsync(f =>
            f.Status == FriendshipStatus.Pending &&
            ((f.RequesterId == requesterId && f.AddresseeId == myId) ||
             (f.RequesterId == myId && f.AddresseeId == requesterId)));
        if (f == null) return Results.NotFound();
        db.Friendships.Remove(f);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    // ── Friends list + unfriend ───────────────────────────────────────────────

    private static async Task<IResult> ListFriends(
        ClaimsPrincipal principal, AppDbContext db)
    {
        var myId = UserId(principal);
        var friends = await db.Friendships
            .Where(f => f.Status == FriendshipStatus.Accepted &&
                        (f.RequesterId == myId || f.AddresseeId == myId))
            .Include(f => f.Requester)
            .Include(f => f.Addressee)
            .OrderBy(f => f.CreatedAt)
            .Select(f => f.ToFriendDto(f.RequesterId == myId ? f.Addressee : f.Requester))
            .ToListAsync();
        return Results.Ok(friends);
    }

    private static async Task<IResult> Unfriend(
        Guid userId, ClaimsPrincipal principal, AppDbContext db)
    {
        var myId = UserId(principal);
        var f = await db.Friendships.FirstOrDefaultAsync(f =>
            f.Status == FriendshipStatus.Accepted &&
            ((f.RequesterId == myId && f.AddresseeId == userId) ||
             (f.RequesterId == userId && f.AddresseeId == myId)));
        if (f == null) return Results.NotFound();
        db.Friendships.Remove(f);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    // ── User bans ─────────────────────────────────────────────────────────────

    private static async Task<IResult> GetBans(ClaimsPrincipal principal, AppDbContext db)
    {
        var myId = UserId(principal);
        var bans = await db.UserBans
            .Where(b => b.BannerId == myId)
            .Include(b => b.Banned)
            .OrderByDescending(b => b.CreatedAt)
            .Select(b => new BannedUserDto(b.BannedId, b.Banned.UserName!, b.CreatedAt))
            .ToListAsync();
        return Results.Ok(bans);
    }

    private static async Task<IResult> BanUser(
        Guid targetId, ClaimsPrincipal principal, AppDbContext db)
    {
        var myId = UserId(principal);
        if (targetId == myId) return Results.BadRequest(new { error = "Cannot ban yourself." });

        var target = await db.Users.FindAsync(targetId);
        if (target == null) return Results.NotFound();

        if (await db.UserBans.AnyAsync(b => b.BannerId == myId && b.BannedId == targetId))
            return Results.Conflict(new { error = "Already banned." });

        // Terminate friendship if it exists
        var friendship = await db.Friendships.FirstOrDefaultAsync(f =>
            (f.RequesterId == myId && f.AddresseeId == targetId) ||
            (f.RequesterId == targetId && f.AddresseeId == myId));
        if (friendship != null) db.Friendships.Remove(friendship);

        // Freeze existing DM
        var (u1, u2) = myId < targetId ? (myId, targetId) : (targetId, myId);
        var dm = await db.PersonalChats.FirstOrDefaultAsync(pc => pc.User1Id == u1 && pc.User2Id == u2);
        if (dm != null) dm.IsFrozen = true;

        db.UserBans.Add(new UserBan { BannerId = myId, BannedId = targetId });
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> UnbanUser(
        Guid targetId, ClaimsPrincipal principal, AppDbContext db)
    {
        var myId = UserId(principal);
        var ban = await db.UserBans.FirstOrDefaultAsync(b => b.BannerId == myId && b.BannedId == targetId);
        if (ban == null) return Results.NotFound();
        db.UserBans.Remove(ban);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    internal static Guid UserId(ClaimsPrincipal p) =>
        Guid.Parse(p.FindFirstValue(ClaimTypes.NameIdentifier)!);

    internal static Task<bool> IsBannedEitherWayAsync(AppDbContext db, Guid a, Guid b) =>
        db.UserBans.AnyAsync(ub => (ub.BannerId == a && ub.BannedId == b) || (ub.BannerId == b && ub.BannedId == a));
}

public record SendFriendRequestBody(Guid UserId, string? Message = null);
