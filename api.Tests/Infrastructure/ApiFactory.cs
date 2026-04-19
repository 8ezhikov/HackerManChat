using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Testcontainers.PostgreSql;
using Testcontainers.Redis;

namespace HackerManChat.Api.Tests.Infrastructure;

public class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    private readonly RedisContainer _redis = new RedisBuilder()
        .WithImage("redis:7-alpine")
        .Build();

    private string _fileStoragePath = string.Empty;

    public async Task InitializeAsync()
    {
        await Task.WhenAll(_postgres.StartAsync(), _redis.StartAsync());
        _fileStoragePath = Path.Combine(Path.GetTempPath(), $"hmc-tests-{Guid.NewGuid()}");
        Directory.CreateDirectory(_fileStoragePath);
    }

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        await Task.WhenAll(_postgres.StopAsync(), _redis.StopAsync());
        if (Directory.Exists(_fileStoragePath))
            Directory.Delete(_fileStoragePath, recursive: true);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Postgres", _postgres.GetConnectionString());
        builder.UseSetting("ConnectionStrings:Redis", _redis.GetConnectionString());
        builder.UseSetting("Jwt:Key", "test-jwt-secret-key-that-is-long-enough-32ch!!");
        builder.UseSetting("Jwt:Issuer", "hackermanchat-test");
        builder.UseSetting("Jwt:Audience", "hackermanchat-test");
        builder.UseSetting("Jwt:AccessTokenExpiryMinutes", "60");
        builder.UseSetting("Jwt:RefreshTokenExpiryDays", "30");
        builder.UseSetting("FileStorage:Path", _fileStoragePath);
        builder.UseSetting("Smtp:Host", "localhost");
        builder.UseSetting("Smtp:Port", "9999");
        builder.UseSetting("AllowedOrigin", "http://localhost:8080");
    }
}
