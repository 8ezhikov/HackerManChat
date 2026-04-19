using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using HackerManChat.Api.Messages;
using HackerManChat.Api.Rooms;
using HackerManChat.Api.Tests.Infrastructure;

namespace HackerManChat.Api.Tests.Attachments;

public class AttachmentTests(ApiFactory factory) : TestBase(factory)
{
    private async Task<(HttpClient client, Guid roomId)> SetupRoomAsync()
    {
        var (client, _) = await RegisterAsync();
        var createRes = await client.PostAsJsonAsync("/api/rooms",
            new CreateRoomRequest(MakeRoomName(), null, "public"));
        var room = (await createRes.Content.ReadFromJsonAsync<RoomDto>())!;
        return (client, room.Id);
    }

    private static MultipartFormDataContent MakeFileContent(
        string filename, string contentType, int bytes)
    {
        var content = new MultipartFormDataContent();
        var fileBytes = new byte[bytes];
        new Random(42).NextBytes(fileBytes);
        var fileContent = new ByteArrayContent(fileBytes);
        fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);
        content.Add(fileContent, "file", filename);
        return content;
    }

    [Fact]
    public async Task UploadFile_Under20Mb_Returns201()
    {
        var (client, roomId) = await SetupRoomAsync();
        using var form = MakeFileContent("test.bin", "application/octet-stream", 1024);

        var res = await client.PostAsync($"/api/rooms/{roomId}/upload", form);

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var msg = (await res.Content.ReadFromJsonAsync<MessageDto>())!;
        msg.Attachments.Should().HaveCount(1);
        msg.Attachments[0].OriginalFileName.Should().Be("test.bin");
    }

    [Fact]
    public async Task UploadImage_Under3Mb_Returns201()
    {
        var (client, roomId) = await SetupRoomAsync();
        using var form = MakeFileContent("photo.jpg", "image/jpeg", 1024 * 100);

        var res = await client.PostAsync($"/api/rooms/{roomId}/upload", form);

        res.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task UploadImage_Exceeding3Mb_ReturnsBadRequest()
    {
        var (client, roomId) = await SetupRoomAsync();
        using var form = MakeFileContent("big.jpg", "image/jpeg", 3 * 1024 * 1024 + 1);

        var res = await client.PostAsync($"/api/rooms/{roomId}/upload", form);

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task UploadFile_Exceeding20Mb_ReturnsBadRequest()
    {
        var (client, roomId) = await SetupRoomAsync();
        using var form = MakeFileContent("huge.bin", "application/octet-stream", 20 * 1024 * 1024 + 1);

        var res = await client.PostAsync($"/api/rooms/{roomId}/upload", form);

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task DownloadAttachment_AsNonMember_ReturnsForbid()
    {
        var (ownerClient, roomId) = await SetupRoomAsync();
        var (nonMemberClient, _) = await RegisterAsync();

        using var form = MakeFileContent("secret.bin", "application/octet-stream", 512);
        var uploadRes = await ownerClient.PostAsync($"/api/rooms/{roomId}/upload", form);
        var msg = (await uploadRes.Content.ReadFromJsonAsync<MessageDto>())!;
        var attachmentId = msg.Attachments[0].Id;

        var downloadRes = await nonMemberClient.GetAsync($"/api/attachments/{attachmentId}");

        downloadRes.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task DownloadAttachment_AsMember_ReturnsFile()
    {
        var (client, roomId) = await SetupRoomAsync();
        using var form = MakeFileContent("data.bin", "application/octet-stream", 256);
        var uploadRes = await client.PostAsync($"/api/rooms/{roomId}/upload", form);
        var msg = (await uploadRes.Content.ReadFromJsonAsync<MessageDto>())!;
        var attachmentId = msg.Attachments[0].Id;

        var downloadRes = await client.GetAsync($"/api/attachments/{attachmentId}");

        downloadRes.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact(Skip = "TODO: verify that after room ban, downloading attachment returns 403")]
    public async Task DownloadAttachment_AfterRoomBan_ReturnsForbid()
    {
        throw new NotImplementedException();
    }
}
