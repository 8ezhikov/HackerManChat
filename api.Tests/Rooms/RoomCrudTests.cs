using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using HackerManChat.Api.Rooms;
using HackerManChat.Api.Tests.Infrastructure;

namespace HackerManChat.Api.Tests.Rooms;

public class RoomCrudTests(ApiFactory factory) : TestBase(factory)
{
    [Fact]
    public async Task CreatePublicRoom_ReturnsCreatedAndCreatorIsOwner()
    {
        var (client, auth) = await RegisterAsync();
        var name = MakeRoomName();

        var res = await client.PostAsJsonAsync("/api/rooms",
            new CreateRoomRequest(name, "desc", "public"));

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var room = (await res.Content.ReadFromJsonAsync<RoomDto>())!;
        room.Name.Should().Be(name);
        room.OwnerId.Should().Be(auth.User.Id);
        room.Visibility.Should().Be("public");
    }

    [Fact]
    public async Task CreatePrivateRoom_ReturnsCreated()
    {
        var (client, _) = await RegisterAsync();
        var name = MakeRoomName();

        var res = await client.PostAsJsonAsync("/api/rooms",
            new CreateRoomRequest(name, null, "private"));

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var room = (await res.Content.ReadFromJsonAsync<RoomDto>())!;
        room.Visibility.Should().Be("private");
    }

    [Fact]
    public async Task JoinPublicRoom_AsNonMember_Returns204()
    {
        var (ownerClient, _) = await RegisterAsync();
        var (memberClient, _) = await RegisterAsync();

        var createRes = await ownerClient.PostAsJsonAsync("/api/rooms",
            new CreateRoomRequest(MakeRoomName(), null, "public"));
        var room = (await createRes.Content.ReadFromJsonAsync<RoomDto>())!;

        var joinRes = await memberClient.PostAsJsonAsync($"/api/rooms/{room.Id}/join", new { });

        joinRes.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task LeaveRoom_AsOwner_ReturnsBadRequest()
    {
        var (client, _) = await RegisterAsync();
        var createRes = await client.PostAsJsonAsync("/api/rooms",
            new CreateRoomRequest(MakeRoomName(), null, "public"));
        var room = (await createRes.Content.ReadFromJsonAsync<RoomDto>())!;

        var leaveRes = await client.DeleteAsync($"/api/rooms/{room.Id}/leave");

        leaveRes.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task LeaveRoom_AsMember_Returns204()
    {
        var (ownerClient, _) = await RegisterAsync();
        var (memberClient, _) = await RegisterAsync();

        var createRes = await ownerClient.PostAsJsonAsync("/api/rooms",
            new CreateRoomRequest(MakeRoomName(), null, "public"));
        var room = (await createRes.Content.ReadFromJsonAsync<RoomDto>())!;

        await memberClient.PostAsJsonAsync($"/api/rooms/{room.Id}/join", new { });
        var leaveRes = await memberClient.DeleteAsync($"/api/rooms/{room.Id}/leave");

        leaveRes.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task DeleteRoom_AsOwner_Returns204()
    {
        var (client, _) = await RegisterAsync();
        var createRes = await client.PostAsJsonAsync("/api/rooms",
            new CreateRoomRequest(MakeRoomName(), null, "public"));
        var room = (await createRes.Content.ReadFromJsonAsync<RoomDto>())!;

        var delRes = await client.DeleteAsync($"/api/rooms/{room.Id}");

        delRes.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task DeleteRoom_AsNonOwner_ReturnsForbid()
    {
        var (ownerClient, _) = await RegisterAsync();
        var (otherClient, _) = await RegisterAsync();

        var createRes = await ownerClient.PostAsJsonAsync("/api/rooms",
            new CreateRoomRequest(MakeRoomName(), null, "public"));
        var room = (await createRes.Content.ReadFromJsonAsync<RoomDto>())!;

        await otherClient.PostAsJsonAsync($"/api/rooms/{room.Id}/join", new { });
        var delRes = await otherClient.DeleteAsync($"/api/rooms/{room.Id}");

        delRes.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task CreateRoom_WithDuplicateName_ReturnsConflict()
    {
        var (client, _) = await RegisterAsync();
        var name = MakeRoomName();

        await client.PostAsJsonAsync("/api/rooms", new CreateRoomRequest(name, null, "public"));
        var res = await client.PostAsJsonAsync("/api/rooms", new CreateRoomRequest(name, null, "public"));

        res.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact(Skip = "TODO: verify private room absent from GET /api/rooms catalog")]
    public async Task CreatePrivateRoom_NotInPublicCatalog()
    {
        throw new NotImplementedException();
    }
}
