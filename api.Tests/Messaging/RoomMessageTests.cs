using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using HackerManChat.Api.Messages;
using HackerManChat.Api.Rooms;
using HackerManChat.Api.Tests.Infrastructure;

namespace HackerManChat.Api.Tests.Messaging;

public class RoomMessageTests(ApiFactory factory) : TestBase(factory)
{
    private async Task<(HttpClient client, Guid roomId)> SetupRoomAsync()
    {
        var (client, _) = await RegisterAsync();
        var createRes = await client.PostAsJsonAsync("/api/rooms",
            new CreateRoomRequest(MakeRoomName(), null, "public"));
        var room = (await createRes.Content.ReadFromJsonAsync<RoomDto>())!;
        return (client, room.Id);
    }

    [Fact]
    public async Task SendMessage_AsMember_Returns201()
    {
        var (client, roomId) = await SetupRoomAsync();

        var res = await client.PostAsJsonAsync($"/api/rooms/{roomId}/messages",
            new SendMessageBody("Hello, world!", null));

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var msg = (await res.Content.ReadFromJsonAsync<MessageDto>())!;
        msg.Content.Should().Be("Hello, world!");
        msg.IsDeleted.Should().BeFalse();
    }

    [Fact]
    public async Task EditOwnMessage_ReturnsOkWithUpdatedContent()
    {
        var (client, roomId) = await SetupRoomAsync();
        var sendRes = await client.PostAsJsonAsync($"/api/rooms/{roomId}/messages",
            new SendMessageBody("original", null));
        var msg = (await sendRes.Content.ReadFromJsonAsync<MessageDto>())!;

        var editRes = await client.PatchAsJsonAsync($"/api/rooms/{roomId}/messages/{msg.Id}",
            new EditMessageBody("updated"));

        editRes.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = (await editRes.Content.ReadFromJsonAsync<MessageDto>())!;
        updated.Content.Should().Be("updated");
        updated.EditedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task DeleteOwnMessage_SetsIsDeletedFlag()
    {
        var (client, roomId) = await SetupRoomAsync();
        var sendRes = await client.PostAsJsonAsync($"/api/rooms/{roomId}/messages",
            new SendMessageBody("to delete", null));
        var msg = (await sendRes.Content.ReadFromJsonAsync<MessageDto>())!;

        var delRes = await client.DeleteAsync($"/api/rooms/{roomId}/messages/{msg.Id}");

        delRes.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task AdminDeleteAnyMessage_Returns204()
    {
        var (ownerClient, _) = await RegisterAsync();
        var (memberClient, memberAuth) = await RegisterAsync();

        var createRes = await ownerClient.PostAsJsonAsync("/api/rooms",
            new CreateRoomRequest(MakeRoomName(), null, "public"));
        var room = (await createRes.Content.ReadFromJsonAsync<RoomDto>())!;
        await memberClient.PostAsJsonAsync($"/api/rooms/{room.Id}/join", new { });

        var sendRes = await memberClient.PostAsJsonAsync($"/api/rooms/{room.Id}/messages",
            new SendMessageBody("member msg", null));
        var msg = (await sendRes.Content.ReadFromJsonAsync<MessageDto>())!;

        var delRes = await ownerClient.DeleteAsync($"/api/rooms/{room.Id}/messages/{msg.Id}");

        delRes.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task SendMessage_Exceeding3KbLimit_ReturnsBadRequest()
    {
        var (client, roomId) = await SetupRoomAsync();
        var overLimit = new string('x', 3 * 1024 + 1);

        var res = await client.PostAsJsonAsync($"/api/rooms/{roomId}/messages",
            new SendMessageBody(overLimit, null));

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task SendMessage_WithReplyToId_ReplyFieldsPopulated()
    {
        var (client, roomId) = await SetupRoomAsync();
        var firstRes = await client.PostAsJsonAsync($"/api/rooms/{roomId}/messages",
            new SendMessageBody("first", null));
        var first = (await firstRes.Content.ReadFromJsonAsync<MessageDto>())!;

        var replyRes = await client.PostAsJsonAsync($"/api/rooms/{roomId}/messages",
            new SendMessageBody("reply", first.Id));

        replyRes.StatusCode.Should().Be(HttpStatusCode.Created);
        var reply = (await replyRes.Content.ReadFromJsonAsync<MessageDto>())!;
        reply.ReplyToId.Should().Be(first.Id);
        reply.ReplyToContent.Should().Be("first");
    }

    [Fact]
    public async Task SendMessage_AsNonMember_ReturnsForbid()
    {
        var (ownerClient, roomId) = await SetupRoomAsync();
        var (otherClient, _) = await RegisterAsync();

        var res = await otherClient.PostAsJsonAsync($"/api/rooms/{roomId}/messages",
            new SendMessageBody("should fail", null));

        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact(Skip = "TODO: verify editing another user's message returns 403")]
    public async Task EditMessage_AsNonAuthor_ReturnsForbid()
    {
        throw new NotImplementedException();
    }
}
