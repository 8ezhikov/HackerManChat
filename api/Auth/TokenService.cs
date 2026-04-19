using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using HackerManChat.Api.Data;
using HackerManChat.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace HackerManChat.Api.Auth;

public class TokenService(IConfiguration config, AppDbContext db)
{
    private readonly string _key = config["Jwt:Key"]!;
    private readonly string _issuer = config["Jwt:Issuer"]!;
    private readonly string _audience = config["Jwt:Audience"]!;
    private readonly int _accessMinutes = int.Parse(config["Jwt:AccessTokenExpiryMinutes"] ?? "15");
    private readonly int _refreshDays = int.Parse(config["Jwt:RefreshTokenExpiryDays"] ?? "30");

    public string CreateAccessToken(ApplicationUser user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_key));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email!),
            new Claim("username", user.UserName!),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };
        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_accessMinutes),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public async Task<(Session session, string rawToken)> CreateSessionAsync(
        ApplicationUser user, string? ipAddress, string? deviceInfo, bool rememberMe = false)
    {
        var raw = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        var expiryDays = rememberMe ? 90 : _refreshDays;
        var session = new Session
        {
            UserId = user.Id,
            RefreshTokenHash = Hash(raw),
            IpAddress = ipAddress,
            DeviceInfo = deviceInfo,
            ExpiresAt = DateTime.UtcNow.AddDays(expiryDays),
        };
        db.Sessions.Add(session);
        await db.SaveChangesAsync();
        return (session, raw);
    }

    public async Task<Session?> FindActiveSessionAsync(string rawToken)
    {
        var hash = Hash(rawToken);
        return await db.Sessions
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.RefreshTokenHash == hash
                && s.RevokedAt == null
                && s.ExpiresAt > DateTime.UtcNow);
    }

    public async Task RevokeAsync(Session session)
    {
        session.RevokedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    private static string Hash(string raw) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
}
