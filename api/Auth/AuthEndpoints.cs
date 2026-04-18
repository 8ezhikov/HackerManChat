using System.Security.Claims;
using HackerManChat.Api.Data;
using HackerManChat.Api.Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace HackerManChat.Api.Auth;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/auth");
        g.MapPost("/register", Register);
        g.MapPost("/login", Login);
        g.MapPost("/refresh", Refresh);
        g.MapPost("/logout", Logout).RequireAuthorization();
        g.MapGet("/sessions", GetSessions).RequireAuthorization();
        g.MapDelete("/sessions/{id:guid}", RevokeSession).RequireAuthorization();
        g.MapDelete("/account", DeleteAccount).RequireAuthorization();
        g.MapPost("/password/change", ChangePassword).RequireAuthorization();
        g.MapPost("/password/reset-request", RequestPasswordReset);
        g.MapPost("/password/reset", ResetPassword);
        return app;
    }

    private static async Task<IResult> Register(
        RegisterRequest req,
        UserManager<ApplicationUser> users,
        TokenService tokens,
        HttpContext http)
    {
        if (await users.FindByEmailAsync(req.Email) != null)
            return Results.Conflict(new { error = "Email already taken." });
        if (await users.FindByNameAsync(req.Username) != null)
            return Results.Conflict(new { error = "Username already taken." });

        var user = new ApplicationUser
        {
            UserName = req.Username,
            Email = req.Email,
            DisplayName = req.Username,
        };
        var result = await users.CreateAsync(user, req.Password);
        if (!result.Succeeded)
            return Results.BadRequest(new { errors = result.Errors.Select(e => e.Description) });

        var access = tokens.CreateAccessToken(user);
        var (session, raw) = await tokens.CreateSessionAsync(
            user, http.Connection.RemoteIpAddress?.ToString(), http.Request.Headers.UserAgent.ToString());

        return Results.Created($"/api/users/{user.Id}", AuthResponse.From(access, raw, session.ExpiresAt, user));
    }

    private static async Task<IResult> Login(
        LoginRequest req,
        UserManager<ApplicationUser> users,
        TokenService tokens,
        HttpContext http)
    {
        var user = await users.FindByEmailAsync(req.Email);
        if (user == null || !await users.CheckPasswordAsync(user, req.Password))
            return Results.Unauthorized();

        var access = tokens.CreateAccessToken(user);
        var (session, raw) = await tokens.CreateSessionAsync(
            user, http.Connection.RemoteIpAddress?.ToString(), http.Request.Headers.UserAgent.ToString());

        return Results.Ok(AuthResponse.From(access, raw, session.ExpiresAt, user));
    }

    private static async Task<IResult> Refresh(
        RefreshRequest req,
        TokenService tokens,
        HttpContext http)
    {
        var session = await tokens.FindActiveSessionAsync(req.RefreshToken);
        if (session == null)
            return Results.Unauthorized();

        await tokens.RevokeAsync(session);

        var access = tokens.CreateAccessToken(session.User);
        var (newSession, raw) = await tokens.CreateSessionAsync(
            session.User, http.Connection.RemoteIpAddress?.ToString(), http.Request.Headers.UserAgent.ToString());

        return Results.Ok(AuthResponse.From(access, raw, newSession.ExpiresAt, session.User));
    }

    private static async Task<IResult> Logout(
        LogoutRequest req,
        TokenService tokens)
    {
        var session = await tokens.FindActiveSessionAsync(req.RefreshToken);
        if (session != null)
            await tokens.RevokeAsync(session);
        return Results.NoContent();
    }

    private static async Task<IResult> GetSessions(
        ClaimsPrincipal principal,
        AppDbContext db)
    {
        var userId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var sessions = await db.Sessions
            .Where(s => s.UserId == userId && s.RevokedAt == null && s.ExpiresAt > DateTime.UtcNow)
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => new SessionDto(s.Id, s.DeviceInfo, s.IpAddress, s.CreatedAt, s.ExpiresAt))
            .ToListAsync();
        return Results.Ok(sessions);
    }

    private static async Task<IResult> RevokeSession(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db)
    {
        var userId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var session = await db.Sessions.FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId);
        if (session == null)
            return Results.NotFound();
        session.RevokedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> DeleteAccount(
        ClaimsPrincipal principal,
        UserManager<ApplicationUser> users,
        AppDbContext db)
    {
        var userId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await users.FindByIdAsync(userId.ToString());
        if (user == null) return Results.NotFound();

        // Delete owned rooms (cascades: messages, members, bans)
        var ownedRooms = await db.Rooms.Where(r => r.OwnerId == userId).ToListAsync();
        db.Rooms.RemoveRange(ownedRooms);
        await db.SaveChangesAsync();

        // Remove RoomBan rows where this user is recorded as the banner (Restrict FK)
        var bannedBy = await db.RoomBans.Where(b => b.BannedById == userId).ToListAsync();
        db.RoomBans.RemoveRange(bannedBy);
        await db.SaveChangesAsync();

        // Delete authored messages in other rooms (Restrict FK on AuthorId)
        var roomMsgs = await db.Messages.Where(m => m.AuthorId == userId && m.RoomId != null).ToListAsync();
        db.Messages.RemoveRange(roomMsgs);
        await db.SaveChangesAsync();

        // Delete personal chats (cascades DM messages)
        var chats = await db.PersonalChats
            .Where(pc => pc.User1Id == userId || pc.User2Id == userId)
            .ToListAsync();
        db.PersonalChats.RemoveRange(chats);
        await db.SaveChangesAsync();

        // Delete the user (cascades: Sessions, RoomMembers, Friendships, UserBans)
        await users.DeleteAsync(user);
        return Results.NoContent();
    }

    private static async Task<IResult> ChangePassword(
        ChangePasswordRequest req,
        ClaimsPrincipal principal,
        UserManager<ApplicationUser> users)
    {
        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 8)
            return Results.BadRequest(new { error = "New password must be at least 8 characters." });

        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var user = await users.FindByIdAsync(userId);
        if (user == null) return Results.NotFound();

        var result = await users.ChangePasswordAsync(user, req.CurrentPassword, req.NewPassword);
        if (!result.Succeeded)
            return Results.BadRequest(new { error = result.Errors.FirstOrDefault()?.Description ?? "Failed to change password." });

        return Results.NoContent();
    }

    private static async Task<IResult> RequestPasswordReset(
        PasswordResetRequestRequest req,
        UserManager<ApplicationUser> users,
        MailService mail,
        HttpContext http)
    {
        // Always return 204 to prevent user enumeration
        var user = await users.FindByEmailAsync(req.Email);
        if (user != null)
        {
            var token = await users.GeneratePasswordResetTokenAsync(user);
            var link = $"{http.Request.Scheme}://{http.Request.Host}/reset-password" +
                       $"?email={Uri.EscapeDataString(user.Email!)}&token={Uri.EscapeDataString(token)}";
            await mail.SendPasswordResetAsync(user.Email!, link);
        }
        return Results.NoContent();
    }

    private static async Task<IResult> ResetPassword(
        PasswordResetRequest req,
        UserManager<ApplicationUser> users)
    {
        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 8)
            return Results.BadRequest(new { error = "New password must be at least 8 characters." });

        var user = await users.FindByEmailAsync(req.Email);
        if (user == null)
            return Results.BadRequest(new { error = "Invalid or expired reset link." });

        var result = await users.ResetPasswordAsync(user, req.Token, req.NewPassword);
        if (!result.Succeeded)
            return Results.BadRequest(new { error = result.Errors.FirstOrDefault()?.Description ?? "Invalid or expired reset link." });

        return Results.NoContent();
    }
}
