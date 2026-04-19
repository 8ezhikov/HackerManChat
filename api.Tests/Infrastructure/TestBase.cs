using System.Net.Http.Headers;
using System.Net.Http.Json;
using HackerManChat.Api.Auth;

namespace HackerManChat.Api.Tests.Infrastructure;

[Collection("Api")]
public abstract class TestBase : IAsyncLifetime
{
    protected readonly ApiFactory Factory;
    protected readonly HttpClient AnonymousClient;

    protected TestBase(ApiFactory factory)
    {
        Factory = factory;
        AnonymousClient = factory.CreateClient();
    }

    public Task InitializeAsync() => Task.CompletedTask;
    public Task DisposeAsync() => Task.CompletedTask;

    /// <summary>Registers a new user and returns an authenticated HttpClient + the auth response.</summary>
    protected async Task<(HttpClient Client, AuthResponse Auth)> RegisterAsync(
        string? email = null, string? username = null, string? password = null)
    {
        var (fakeEmail, fakeUsername, fakePassword) = FakeData.NewUser();
        var req = new RegisterRequest(
            email ?? fakeEmail,
            username ?? fakeUsername,
            password ?? fakePassword);

        var res = await AnonymousClient.PostAsJsonAsync("/api/auth/register", req);
        res.EnsureSuccessStatusCode();

        var auth = (await res.Content.ReadFromJsonAsync<AuthResponse>())!;
        var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth);
    }

    protected async Task<HttpClient> LoginAsync(string email, string password)
    {
        var req = new LoginRequest(email, password);
        var res = await AnonymousClient.PostAsJsonAsync("/api/auth/login", req);
        res.EnsureSuccessStatusCode();
        var auth = (await res.Content.ReadFromJsonAsync<AuthResponse>())!;
        var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return client;
    }

    protected static string MakeRoomName() =>
        "room-" + Guid.NewGuid().ToString("N")[..12];
}

[CollectionDefinition("Api")]
public class ApiCollection : ICollectionFixture<ApiFactory> { }
