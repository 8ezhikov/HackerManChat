using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using HackerManChat.Api.Rooms;
using HackerManChat.Api.Tests.Infrastructure;

namespace HackerManChat.Api.Tests.Rooms;

public class RoomMembershipTests(ApiFactory factory) : TestBase(factory)
{
    private async Task<(HttpClient ownerClient, RoomDto room, HttpClient memberClient, Guid memberId)>
        SetupRoomWithMemberAsync()
    {
        var (ownerClient, _) = await RegisterAsync();
        var (memberClient, memberAuth) = await RegisterAsync();

        var createRes = await ownerClient.PostAsJsonAsync("/api/rooms",
            new CreateRoomRequest(MakeRoomName(), null, "public"));
        var room = (await createRes.Content.ReadFromJsonAsync<RoomDto>())!;

        await memberClient.PostAsJsonAsync($"/api/rooms/{room.Id}/join", new { });

        return (ownerClient, room, memberClient, memberAuth.User.Id);
    }

    [Fact]
    public async Task InviteToPrivateRoom_TargetBecomesMember()
    {
        var (ownerClient, ownerAuth) = await RegisterAsync();
        var (inviteeClient, inviteeAuth) = await RegisterAsync();

        var createRes = await ownerClient.PostAsJsonAsync("/api/rooms",
            new CreateRoomRequest(MakeRoomName(), null, "private"));
        var room = (await createRes.Content.ReadFromJsonAsync<RoomDto>())!;

        var inviteRes = await ownerClient.PostAsJsonAsync(
            $"/api/rooms/{room.Id}/invites",
            new InviteRequest(inviteeAuth.User.Id));
        inviteRes.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var membersRes = await ownerClient.GetAsync($"/api/rooms/{room.Id}/members");
        membersRes.StatusCode.Should().Be(HttpStatusCode.OK);
        var members = (await membersRes.Content.ReadFromJsonAsync<RoomMemberDto[]>())!;
        members.Should().Contain(m => m.UserId == inviteeAuth.User.Id);
    }

    [Fact]
    public async Task BanMember_KicksAndBlocksRejoin()
    {
        var (ownerClient, room, memberClient, memberId) = await SetupRoomWithMemberAsync();

        var banRes = await ownerClient.PostAsJsonAsync(
            $"/api/rooms/{room.Id}/bans/{memberId}", new { });
        banRes.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var rejoinRes = await memberClient.PostAsJsonAsync(
            $"/api/rooms/{room.Id}/join", new { });
        rejoinRes.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task UnbanMember_AllowsRejoin()
    {
        var (ownerClient, room, memberClient, memberId) = await SetupRoomWithMemberAsync();

        await ownerClient.PostAsJsonAsync($"/api/rooms/{room.Id}/bans/{memberId}", new { });
        var unbanRes = await ownerClient.DeleteAsync($"/api/rooms/{room.Id}/bans/{memberId}");
        unbanRes.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var rejoinRes = await memberClient.PostAsJsonAsync(
            $"/api/rooms/{room.Id}/join", new { });
        rejoinRes.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task PromoteAdmin_MemberRoleBecomesAdmin()
    {
        var (ownerClient, room, _, memberId) = await SetupRoomWithMemberAsync();

        var promoteRes = await ownerClient.PostAsJsonAsync(
            $"/api/rooms/{room.Id}/admins/{memberId}", new { });
        promoteRes.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var membersRes = await ownerClient.GetAsync($"/api/rooms/{room.Id}/members");
        var members = (await membersRes.Content.ReadFromJsonAsync<RoomMemberDto[]>())!;
        members.First(m => m.UserId == memberId).Role.Should().Be("admin");
    }

    [Fact]
    public async Task DemoteAdmin_AsOwner_Returns204()
    {
        var (ownerClient, room, _, memberId) = await SetupRoomWithMemberAsync();

        await ownerClient.PostAsJsonAsync($"/api/rooms/{room.Id}/admins/{memberId}", new { });
        var demoteRes = await ownerClient.DeleteAsync($"/api/rooms/{room.Id}/admins/{memberId}");

        demoteRes.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact(Skip = "TODO: verify a non-owner admin cannot demote another admin")]
    public async Task DemoteAdmin_AsRegularAdmin_ReturnsForbid()
    {
        throw new NotImplementedException();
    }
}
