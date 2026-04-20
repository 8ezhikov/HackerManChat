using HackerManChat.Api.Data;
using HackerManChat.Api.Data.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;

namespace HackerManChat.Api.Hubs;

[Authorize]
public class PresenceHub(AppDbContext db, IConnectionMultiplexer redis) : Hub
{
    private IDatabase Redis => redis.GetDatabase();

    public override async Task OnConnectedAsync()
    {
        var userId = GetUserId();

        await Redis.HashSetAsync(PresenceKey(userId), Context.ConnectionId, "online");

        // Subscribe to friends' presence groups AND own group (to receive own presence changes)
        var friendIds = await GetFriendIdsAsync(userId);
        foreach (var fId in friendIds)
            await Groups.AddToGroupAsync(Context.ConnectionId, HubConstants.FriendOfGroup(fId));
        await Groups.AddToGroupAsync(Context.ConnectionId, HubConstants.FriendOfGroup(userId));

        // Announce own presence to friend-of group
        await Clients.Group(HubConstants.FriendOfGroup(userId))
            .SendAsync(HubConstants.PresenceChanged, userId, "online");

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = GetUserId();

        await Redis.HashDeleteAsync(PresenceKey(userId), Context.ConnectionId);

        var state = await ComputePresenceAsync(userId);
        await Clients.Group(HubConstants.FriendOfGroup(userId))
            .SendAsync(HubConstants.PresenceChanged, userId, state);

        await base.OnDisconnectedAsync(exception);
    }

    // Called by the leader tab every ~30 s; isActive = false when all tabs are idle
    public async Task Heartbeat(bool isActive)
    {
        var userId = GetUserId();
        var prev = await ComputePresenceAsync(userId);

        await Redis.HashSetAsync(PresenceKey(userId), Context.ConnectionId, isActive ? "online" : "afk");

        var next = await ComputePresenceAsync(userId);
        if (next != prev)
            await Clients.Group(HubConstants.FriendOfGroup(userId))
                .SendAsync(HubConstants.PresenceChanged, userId, next);
    }

    // Called on connect to bootstrap presence state for all friends
    public async Task<Dictionary<string, string>> GetFriendPresences()
    {
        var userId = GetUserId();
        var friendIds = await GetFriendIdsAsync(userId);
        var result = new Dictionary<string, string>();
        foreach (var fId in friendIds)
            result[fId.ToString()] = await ComputePresenceAsync(fId);
        result[userId.ToString()] = await ComputePresenceAsync(userId);
        return result;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<string> ComputePresenceAsync(Guid userId)
    {
        var entries = await Redis.HashGetAllAsync(PresenceKey(userId));
        if (entries.Length == 0) return "offline";
        return Array.Exists(entries, e => e.Value == "online") ? "online" : "afk";
    }

    private async Task<List<Guid>> GetFriendIdsAsync(Guid userId) =>
        await db.Friendships
            .Where(f => f.Status == FriendshipStatus.Accepted &&
                        (f.RequesterId == userId || f.AddresseeId == userId))
            .Select(f => f.RequesterId == userId ? f.AddresseeId : f.RequesterId)
            .ToListAsync();

    private Guid GetUserId() => Guid.Parse(Context.UserIdentifier!);
    private static string PresenceKey(Guid userId) => $"presence:{userId}";
}
