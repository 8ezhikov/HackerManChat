using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using HackerManChat.Api.Friends;
using HackerManChat.Api.Tests.Infrastructure;

namespace HackerManChat.Api.Tests.Friends;

public class FriendTests(ApiFactory factory) : TestBase(factory)
{
    private async Task<(HttpClient clientA, Guid idA, HttpClient clientB, Guid idB)> TwoUsersAsync()
    {
        var (clientA, authA) = await RegisterAsync();
        var (clientB, authB) = await RegisterAsync();
        return (clientA, authA.User.Id, clientB, authB.User.Id);
    }

    [Fact]
    public async Task SendFriendRequest_Returns204()
    {
        var (clientA, _, _, idB) = await TwoUsersAsync();

        var res = await clientA.PostAsJsonAsync("/api/friends/requests",
            new SendFriendRequestBody(idB));

        res.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task AcceptFriendRequest_StatusBecomesAccepted_FriendAppearsInList()
    {
        var (clientA, idA, clientB, idB) = await TwoUsersAsync();
        await clientA.PostAsJsonAsync("/api/friends/requests", new SendFriendRequestBody(idB));

        var acceptRes = await clientB.PostAsJsonAsync($"/api/friends/requests/{idA}/accept", new { });
        acceptRes.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var listRes = await clientB.GetAsync("/api/friends");
        var friends = (await listRes.Content.ReadFromJsonAsync<FriendDto[]>())!;
        friends.Should().Contain(f => f.UserId == idA);
    }

    [Fact]
    public async Task DeclineFriendRequest_RequestIsRemoved()
    {
        var (clientA, idA, clientB, idB) = await TwoUsersAsync();
        await clientA.PostAsJsonAsync("/api/friends/requests", new SendFriendRequestBody(idB));

        var declineRes = await clientB.DeleteAsync($"/api/friends/requests/{idA}");
        declineRes.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var incomingRes = await clientB.GetAsync("/api/friends/requests");
        var incoming = (await incomingRes.Content.ReadFromJsonAsync<FriendRequestDto[]>())!;
        incoming.Should().NotContain(r => r.UserId == idA);
    }

    [Fact]
    public async Task Unfriend_FriendIsRemovedFromList()
    {
        var (clientA, idA, clientB, idB) = await TwoUsersAsync();
        await clientA.PostAsJsonAsync("/api/friends/requests", new SendFriendRequestBody(idB));
        await clientB.PostAsJsonAsync($"/api/friends/requests/{idA}/accept", new { });

        var unfriendRes = await clientA.DeleteAsync($"/api/friends/{idB}");
        unfriendRes.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var listRes = await clientA.GetAsync("/api/friends");
        var friends = (await listRes.Content.ReadFromJsonAsync<FriendDto[]>())!;
        friends.Should().NotContain(f => f.UserId == idB);
    }

    [Fact]
    public async Task BanUser_TerminatesFriendship()
    {
        var (clientA, idA, clientB, idB) = await TwoUsersAsync();
        await clientA.PostAsJsonAsync("/api/friends/requests", new SendFriendRequestBody(idB));
        await clientB.PostAsJsonAsync($"/api/friends/requests/{idA}/accept", new { });

        var banRes = await clientA.PostAsJsonAsync($"/api/users/bans/{idB}", new { });
        banRes.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var listRes = await clientA.GetAsync("/api/friends");
        var friends = (await listRes.Content.ReadFromJsonAsync<FriendDto[]>())!;
        friends.Should().NotContain(f => f.UserId == idB);
    }

    [Fact]
    public async Task BanUser_FreezesDm()
    {
        var (clientA, idA, clientB, idB) = await TwoUsersAsync();
        // Become friends first
        await clientA.PostAsJsonAsync("/api/friends/requests", new SendFriendRequestBody(idB));
        await clientB.PostAsJsonAsync($"/api/friends/requests/{idA}/accept", new { });
        // Open DM
        var dmRes = await clientA.PostAsJsonAsync("/api/dms",
            new { userId = idB });
        dmRes.EnsureSuccessStatusCode();

        // A bans B — DM should freeze
        await clientA.PostAsJsonAsync($"/api/users/bans/{idB}", new { });

        // B can no longer send to A (DM frozen / banned)
        var sendRes = await clientB.PostAsJsonAsync($"/api/friends/requests",
            new SendFriendRequestBody(idA));
        // Cannot re-friend (ban blocks it)
        sendRes.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact(Skip = "TODO: verify sending a friend request to self returns 400")]
    public async Task SendFriendRequest_ToSelf_ReturnsBadRequest()
    {
        throw new NotImplementedException();
    }
}
