using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using HackerManChat.Api.Auth;
using HackerManChat.Api.Tests.Infrastructure;

namespace HackerManChat.Api.Tests.Auth;

public class AuthTests(ApiFactory factory) : TestBase(factory)
{
    [Fact]
    public async Task Register_WithUniqueCredentials_ReturnsCreatedWithTokens()
    {
        var (email, username, password) = FakeData.NewUser();
        var res = await AnonymousClient.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest(email, username, password));

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var auth = (await res.Content.ReadFromJsonAsync<AuthResponse>())!;
        auth.AccessToken.Should().NotBeNullOrEmpty();
        auth.RefreshToken.Should().NotBeNullOrEmpty();
        auth.User.Username.Should().Be(username);
    }

    [Fact]
    public async Task Register_WithDuplicateEmail_ReturnsConflict()
    {
        var (email, _, password) = FakeData.NewUser();
        var (_, username2, _) = FakeData.NewUser();

        await AnonymousClient.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest(email, username2 + "a", password));

        var (_, username3, _) = FakeData.NewUser();
        var res = await AnonymousClient.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest(email, username3 + "b", password));

        res.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Register_WithDuplicateUsername_ReturnsConflict()
    {
        var (email1, username, password) = FakeData.NewUser();
        var (email2, _, _) = FakeData.NewUser();

        await AnonymousClient.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest(email1, username, password));

        var res = await AnonymousClient.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest(email2, username, password));

        res.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Login_WithValidCredentials_ReturnsOkWithTokens()
    {
        var (email, username, password) = FakeData.NewUser();
        await AnonymousClient.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest(email, username, password));

        var res = await AnonymousClient.PostAsJsonAsync("/api/auth/login",
            new LoginRequest(email, password));

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var auth = (await res.Content.ReadFromJsonAsync<AuthResponse>())!;
        auth.AccessToken.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task Login_WithWrongPassword_ReturnsUnauthorized()
    {
        var (email, username, password) = FakeData.NewUser();
        await AnonymousClient.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest(email, username, password));

        var res = await AnonymousClient.PostAsJsonAsync("/api/auth/login",
            new LoginRequest(email, "WrongPass99!"));

        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Logout_InvalidatesCurrentSession_RefreshReturnsUnauthorized()
    {
        var (email, username, password) = FakeData.NewUser();
        var regRes = await AnonymousClient.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest(email, username, password));
        var auth = (await regRes.Content.ReadFromJsonAsync<AuthResponse>())!;

        var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", auth.AccessToken);

        var logoutRes = await client.PostAsJsonAsync("/api/auth/logout",
            new LogoutRequest(auth.RefreshToken));
        logoutRes.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var refreshRes = await AnonymousClient.PostAsJsonAsync("/api/auth/refresh",
            new RefreshRequest(auth.RefreshToken));
        refreshRes.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task DeleteAccount_RemovesUser_And_CascadesOwnedRoom()
    {
        var (client, auth) = await RegisterAsync();

        var roomRes = await client.PostAsJsonAsync("/api/rooms",
            new { name = MakeRoomName(), description = "test", visibility = "public" });
        roomRes.EnsureSuccessStatusCode();
        var room = (await roomRes.Content.ReadFromJsonAsync<HackerManChat.Api.Rooms.RoomDto>())!;

        var delRes = await client.DeleteAsync("/api/auth/account");
        delRes.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Sessions are cascade-deleted: refresh token should no longer work
        var refreshRes = await AnonymousClient.PostAsJsonAsync("/api/auth/refresh",
            new RefreshRequest(auth.RefreshToken));
        refreshRes.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        // Owned room should be cascade-deleted
        var (otherClient, _) = await RegisterAsync();
        var getRoomRes = await otherClient.GetAsync($"/api/rooms/{room.Id}");
        getRoomRes.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact(Skip = "TODO: password reset requires SMTP / token extraction from MailHog")]
    public async Task PasswordReset_WithValidToken_AllowsLoginWithNewPassword()
    {
        throw new NotImplementedException();
    }
}
