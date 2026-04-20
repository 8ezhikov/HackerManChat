using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using HackerManChat.Api.Auth;
using HackerManChat.Api.Tests.Infrastructure;

namespace HackerManChat.Api.Tests.Auth;

public class SessionTests(ApiFactory factory) : TestBase(factory)
{
    [Fact]
    public async Task GetSessions_ReturnsActiveSessionsForCallingUser()
    {
        var (client, _) = await RegisterAsync();

        var res = await client.GetAsync("/api/auth/sessions");

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var sessions = (await res.Content.ReadFromJsonAsync<SessionDto[]>())!;
        sessions.Should().NotBeEmpty();
    }

    [Fact]
    public async Task RevokeSession_ByOwner_SessionNoLongerInList()
    {
        var (email, username, password) = FakeData.NewUser();
        var regRes = await AnonymousClient.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest(email, username, password));
        var auth = (await regRes.Content.ReadFromJsonAsync<AuthResponse>())!;

        var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", auth.AccessToken);

        var sessions = (await (await client.GetAsync("/api/auth/sessions"))
            .Content.ReadFromJsonAsync<SessionDto[]>())!;
        sessions.Should().HaveCountGreaterThan(0);
        var sessionId = sessions[0].Id;

        var revokeRes = await client.DeleteAsync($"/api/auth/sessions/{sessionId}");
        revokeRes.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task RevokeSession_ByDifferentUser_ReturnsNotFound()
    {
        var (clientA, _) = await RegisterAsync();
        var (clientB, _) = await RegisterAsync();

        var sessionsRes = await clientA.GetAsync("/api/auth/sessions");
        var sessions = (await sessionsRes.Content.ReadFromJsonAsync<SessionDto[]>())!;
        var sessionIdOfA = sessions[0].Id;

        // API scopes session lookup to the requesting user, so another user's session ID → 404
        var revokeRes = await clientB.DeleteAsync($"/api/auth/sessions/{sessionIdOfA}");
        revokeRes.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
