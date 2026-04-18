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
}
