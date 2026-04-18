using System.Security.Claims;
using HackerManChat.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace HackerManChat.Api.Users;

public static class UsersEndpoints
{
    public static IEndpointRouteBuilder MapUsersEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/users/search", Search).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> Search(
        string username,
        ClaimsPrincipal principal,
        AppDbContext db)
    {
        var myId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var results = await db.Users
            .Where(u => u.Id != myId && u.UserName!.ToLower().Contains(username.ToLower()))
            .Take(10)
            .Select(u => new UserSearchResult(u.Id, u.UserName!, u.DisplayName))
            .ToListAsync();
        return Results.Ok(results);
    }
}

public record UserSearchResult(Guid Id, string Username, string DisplayName);
