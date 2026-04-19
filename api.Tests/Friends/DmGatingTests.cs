using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using HackerManChat.Api.DMs;
using HackerManChat.Api.Friends;
using HackerManChat.Api.Messages;
using HackerManChat.Api.Tests.Infrastructure;

namespace HackerManChat.Api.Tests.Friends;

public class DmGatingTests(ApiFactory factory) : TestBase(factory)
{
    private async Task MakeFriendsAsync(HttpClient clientA, Guid idA, HttpClient clientB, Guid idB)
    {
        await clientA.PostAsJsonAsync("/api/friends/requests", new SendFriendRequestBody(idB));
        await clientB.PostAsJsonAsync($"/api/friends/requests/{idA}/accept", new { });
    }

    [Fact]
    public async Task OpenDm_AsFriends_ReturnsChatDto()
    {
        var (clientA, authA) = await RegisterAsync();
        var (clientB, authB) = await RegisterAsync();
        await MakeFriendsAsync(clientA, authA.User.Id, clientB, authB.User.Id);

        var res = await clientA.PostAsJsonAsync("/api/dms", new OpenDmBody(authB.User.Id));

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var dm = (await res.Content.ReadFromJsonAsync<DmDto>())!;
        dm.OtherUserId.Should().Be(authB.User.Id);
        dm.IsFrozen.Should().BeFalse();
    }

    [Fact]
    public async Task SendDmMessage_AsNonFriend_ReturnsForbid()
    {
        var (clientA, authA) = await RegisterAsync();
        var (clientB, authB) = await RegisterAsync();

        // Attempt to open DM without being friends
        var openRes = await clientA.PostAsJsonAsync("/api/dms", new OpenDmBody(authB.User.Id));
        openRes.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task SendDmMessage_WhenFrozen_ReturnsForbid()
    {
        var (clientA, authA) = await RegisterAsync();
        var (clientB, authB) = await RegisterAsync();
        await MakeFriendsAsync(clientA, authA.User.Id, clientB, authB.User.Id);

        var openRes = await clientA.PostAsJsonAsync("/api/dms", new OpenDmBody(authB.User.Id));
        var dm = (await openRes.Content.ReadFromJsonAsync<DmDto>())!;

        // A bans B — DM becomes frozen
        await clientA.PostAsJsonAsync($"/api/users/bans/{authB.User.Id}", new { });

        var sendRes = await clientB.PostAsJsonAsync($"/api/dms/{dm.Id}/messages",
            new SendMessageBody("should be blocked", null));

        sendRes.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
