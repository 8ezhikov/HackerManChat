using System.Security.Claims;
using HackerManChat.Api.Data;
using HackerManChat.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace HackerManChat.Api.Rooms;

public static class RoomEndpoints
{
    public static IEndpointRouteBuilder MapRoomEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/rooms").RequireAuthorization();

        g.MapPost("", CreateRoom);
        g.MapGet("", ListRooms);
        g.MapGet("mine", GetMyRooms);
        g.MapGet("{id:guid}", GetRoom);
        g.MapPatch("{id:guid}", UpdateRoom);
        g.MapDelete("{id:guid}", DeleteRoom);

        g.MapGet("{id:guid}/members", GetMembers);
        g.MapPost("{id:guid}/join", JoinRoom);
        g.MapDelete("{id:guid}/leave", LeaveRoom);
        g.MapDelete("{id:guid}/members/{userId:guid}", KickMember);

        g.MapGet("{id:guid}/bans", GetBans);
        g.MapPost("{id:guid}/bans/{userId:guid}", BanMember);
        g.MapDelete("{id:guid}/bans/{userId:guid}", UnbanMember);

        g.MapPost("{id:guid}/admins/{userId:guid}", PromoteAdmin);
        g.MapDelete("{id:guid}/admins/{userId:guid}", DemoteAdmin);

        g.MapPost("{id:guid}/invites", InviteMember);

        return app;
    }

    // ── Room CRUD ────────────────────────────────────────────────────────────

    private static async Task<IResult> CreateRoom(
        CreateRoomRequest req, ClaimsPrincipal principal, AppDbContext db)
    {
        var userId = UserId(principal);
        if (!Enum.TryParse<RoomVisibility>(req.Visibility, true, out var vis))
            return Results.BadRequest(new { error = "Visibility must be 'public' or 'private'." });
        if (string.IsNullOrWhiteSpace(req.Name) || req.Name.Length > 64)
            return Results.BadRequest(new { error = "Name must be 1–64 characters." });
        if (await db.Rooms.AnyAsync(r => r.Name == req.Name))
            return Results.Conflict(new { error = "Room name already taken." });

        var room = new Room { Name = req.Name, Description = req.Description, OwnerId = userId, Visibility = vis };
        db.Rooms.Add(room);
        db.RoomMembers.Add(new RoomMember { RoomId = room.Id, UserId = userId, Role = RoomMemberRole.Admin });
        await db.SaveChangesAsync();
        return Results.Created($"/api/rooms/{room.Id}", room.ToDto());
    }

    private static async Task<IResult> GetMyRooms(
        ClaimsPrincipal principal, AppDbContext db)
    {
        var uid = UserId(principal);
        var rooms = await db.RoomMembers
            .Where(m => m.UserId == uid)
            .Include(m => m.Room)
            .Select(m => m.Room.ToDto())
            .ToListAsync();
        return Results.Ok(rooms);
    }

    private static async Task<IResult> ListRooms(
        AppDbContext db, int page = 1, int pageSize = 20, string? search = null)
    {
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Rooms.Where(r => r.Visibility == RoomVisibility.Public);
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(r => r.Name.ToLower().Contains(search.ToLower()));
        var rooms = await query
            .OrderBy(r => r.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new RoomDto(
                r.Id, r.Name, r.Description,
                r.Visibility.ToString().ToLower(),
                r.OwnerId, r.CreatedAt,
                db.RoomMembers.Count(m => m.RoomId == r.Id)))
            .ToListAsync();
        return Results.Ok(rooms);
    }

    private static async Task<IResult> GetRoom(
        Guid id, ClaimsPrincipal principal, AppDbContext db)
    {
        var room = await db.Rooms.FindAsync(id);
        if (room == null) return Results.NotFound();
        if (room.Visibility == RoomVisibility.Private)
        {
            var uid = UserId(principal);
            var isMember = await db.RoomMembers.AnyAsync(m => m.RoomId == id && m.UserId == uid);
            if (!isMember) return Results.Forbid();
        }
        return Results.Ok(room.ToDto());
    }

    private static async Task<IResult> UpdateRoom(
        Guid id, UpdateRoomRequest req, ClaimsPrincipal principal, AppDbContext db)
    {
        var room = await db.Rooms.FindAsync(id);
        if (room == null) return Results.NotFound();
        if (room.OwnerId != UserId(principal)) return Results.Forbid();

        if (req.Name != null)
        {
            if (req.Name.Length is 0 or > 64)
                return Results.BadRequest(new { error = "Name must be 1–64 characters." });
            if (req.Name != room.Name && await db.Rooms.AnyAsync(r => r.Name == req.Name))
                return Results.Conflict(new { error = "Room name already taken." });
            room.Name = req.Name;
        }
        if (req.Description != null) room.Description = req.Description;
        if (req.Visibility != null)
        {
            if (!Enum.TryParse<RoomVisibility>(req.Visibility, true, out var vis))
                return Results.BadRequest(new { error = "Visibility must be 'public' or 'private'." });
            room.Visibility = vis;
        }
        await db.SaveChangesAsync();
        return Results.Ok(room.ToDto());
    }

    private static async Task<IResult> DeleteRoom(
        Guid id, ClaimsPrincipal principal, AppDbContext db)
    {
        var room = await db.Rooms.FindAsync(id);
        if (room == null) return Results.NotFound();
        if (room.OwnerId != UserId(principal)) return Results.Forbid();
        db.Rooms.Remove(room);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    // ── Membership ───────────────────────────────────────────────────────────

    private static async Task<IResult> GetMembers(
        Guid id, ClaimsPrincipal principal, AppDbContext db)
    {
        var uid = UserId(principal);
        if (!await IsMemberAsync(db, id, uid)) return Results.Forbid();

        var members = await db.RoomMembers
            .Where(m => m.RoomId == id)
            .Include(m => m.User)
            .OrderBy(m => m.JoinedAt)
            .Select(m => new RoomMemberDto(m.UserId, m.User.UserName!, m.User.DisplayName, m.Role.ToString().ToLower(), m.JoinedAt))
            .ToListAsync();
        return Results.Ok(members);
    }

    private static async Task<IResult> JoinRoom(
        Guid id, ClaimsPrincipal principal, AppDbContext db)
    {
        var uid = UserId(principal);
        var room = await db.Rooms.FindAsync(id);
        if (room == null) return Results.NotFound();
        if (room.Visibility == RoomVisibility.Private)
            return Results.Forbid();
        if (await db.RoomBans.AnyAsync(b => b.RoomId == id && b.UserId == uid))
            return Results.Forbid();
        if (await db.RoomMembers.AnyAsync(m => m.RoomId == id && m.UserId == uid))
            return Results.Conflict(new { error = "Already a member." });

        db.RoomMembers.Add(new RoomMember { RoomId = id, UserId = uid });
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> LeaveRoom(
        Guid id, ClaimsPrincipal principal, AppDbContext db)
    {
        var uid = UserId(principal);
        var room = await db.Rooms.FindAsync(id);
        if (room == null) return Results.NotFound();
        if (room.OwnerId == uid)
            return Results.BadRequest(new { error = "Owner cannot leave; delete the room instead." });

        var member = await db.RoomMembers.FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == uid);
        if (member == null) return Results.NotFound();
        db.RoomMembers.Remove(member);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> KickMember(
        Guid id, Guid userId, ClaimsPrincipal principal, AppDbContext db)
    {
        var actorId = UserId(principal);
        if (!await IsAdminOrOwnerAsync(db, id, actorId)) return Results.Forbid();

        var room = await db.Rooms.FindAsync(id);
        if (room == null) return Results.NotFound();
        if (userId == room.OwnerId) return Results.Forbid();

        // Admins can't kick other admins unless they're the owner
        var target = await db.RoomMembers.FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId);
        if (target == null) return Results.NotFound();
        if (target.Role == RoomMemberRole.Admin && actorId != room.OwnerId) return Results.Forbid();

        db.RoomMembers.Remove(target);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    // ── Bans ─────────────────────────────────────────────────────────────────

    private static async Task<IResult> GetBans(
        Guid id, ClaimsPrincipal principal, AppDbContext db)
    {
        if (!await IsAdminOrOwnerAsync(db, id, UserId(principal))) return Results.Forbid();
        var bans = await db.RoomBans
            .Where(b => b.RoomId == id)
            .Include(b => b.User)
            .Select(b => new RoomBanDto(b.UserId, b.User.UserName!, b.BannedById, b.CreatedAt))
            .ToListAsync();
        return Results.Ok(bans);
    }

    private static async Task<IResult> BanMember(
        Guid id, Guid userId, ClaimsPrincipal principal, AppDbContext db)
    {
        var actorId = UserId(principal);
        if (!await IsAdminOrOwnerAsync(db, id, actorId)) return Results.Forbid();

        var room = await db.Rooms.FindAsync(id);
        if (room == null) return Results.NotFound();
        if (userId == room.OwnerId) return Results.Forbid();

        var target = await db.RoomMembers.FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId);
        if (target != null && target.Role == RoomMemberRole.Admin && actorId != room.OwnerId)
            return Results.Forbid();

        if (await db.RoomBans.AnyAsync(b => b.RoomId == id && b.UserId == userId))
            return Results.Conflict(new { error = "Already banned." });

        if (target != null) db.RoomMembers.Remove(target);
        db.RoomBans.Add(new RoomBan { RoomId = id, UserId = userId, BannedById = actorId });
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> UnbanMember(
        Guid id, Guid userId, ClaimsPrincipal principal, AppDbContext db)
    {
        if (!await IsAdminOrOwnerAsync(db, id, UserId(principal))) return Results.Forbid();
        var ban = await db.RoomBans.FirstOrDefaultAsync(b => b.RoomId == id && b.UserId == userId);
        if (ban == null) return Results.NotFound();
        db.RoomBans.Remove(ban);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    // ── Admin management ─────────────────────────────────────────────────────

    private static async Task<IResult> PromoteAdmin(
        Guid id, Guid userId, ClaimsPrincipal principal, AppDbContext db)
    {
        var room = await db.Rooms.FindAsync(id);
        if (room == null) return Results.NotFound();
        if (room.OwnerId != UserId(principal)) return Results.Forbid();

        var member = await db.RoomMembers.FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId);
        if (member == null) return Results.NotFound();
        member.Role = RoomMemberRole.Admin;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> DemoteAdmin(
        Guid id, Guid userId, ClaimsPrincipal principal, AppDbContext db)
    {
        var room = await db.Rooms.FindAsync(id);
        if (room == null) return Results.NotFound();
        if (room.OwnerId != UserId(principal)) return Results.Forbid();
        if (userId == room.OwnerId) return Results.Forbid();

        var member = await db.RoomMembers.FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId);
        if (member == null) return Results.NotFound();
        member.Role = RoomMemberRole.Member;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    // ── Private room invites ──────────────────────────────────────────────────

    private static async Task<IResult> InviteMember(
        Guid id, InviteRequest req, ClaimsPrincipal principal, AppDbContext db)
    {
        var actorId = UserId(principal);
        if (!await IsAdminOrOwnerAsync(db, id, actorId)) return Results.Forbid();

        var room = await db.Rooms.FindAsync(id);
        if (room == null) return Results.NotFound();

        if (await db.RoomBans.AnyAsync(b => b.RoomId == id && b.UserId == req.UserId))
            return Results.Conflict(new { error = "User is banned from this room." });
        if (await db.RoomMembers.AnyAsync(m => m.RoomId == id && m.UserId == req.UserId))
            return Results.Conflict(new { error = "User is already a member." });

        db.RoomMembers.Add(new RoomMember { RoomId = id, UserId = req.UserId });
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static Guid UserId(ClaimsPrincipal p) =>
        Guid.Parse(p.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private static Task<bool> IsMemberAsync(AppDbContext db, Guid roomId, Guid userId) =>
        db.RoomMembers.AnyAsync(m => m.RoomId == roomId && m.UserId == userId);

    private static async Task<bool> IsAdminOrOwnerAsync(AppDbContext db, Guid roomId, Guid userId)
    {
        var member = await db.RoomMembers.FirstOrDefaultAsync(m => m.RoomId == roomId && m.UserId == userId);
        return member?.Role == RoomMemberRole.Admin; // owner is always stored as Admin
    }
}
