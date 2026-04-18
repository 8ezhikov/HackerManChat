using HackerManChat.Api.Data.Entities;

namespace HackerManChat.Api.Auth;

public record RegisterRequest(string Email, string Username, string Password);
public record LoginRequest(string Email, string Password);
public record RefreshRequest(string RefreshToken);
public record LogoutRequest(string RefreshToken);

public record UserDto(Guid Id, string Username, string Email, string DisplayName)
{
    public static UserDto From(ApplicationUser u) => new(u.Id, u.UserName!, u.Email!, u.DisplayName);
}

public record AuthResponse(string AccessToken, string RefreshToken, DateTime RefreshExpiresAt, UserDto User)
{
    public static AuthResponse From(string access, string refresh, DateTime expires, ApplicationUser user)
        => new(access, refresh, expires, UserDto.From(user));
}

public record SessionDto(Guid Id, string? DeviceInfo, string? IpAddress, DateTime CreatedAt, DateTime ExpiresAt);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public record PasswordResetRequestRequest(string Email);
public record PasswordResetRequest(string Email, string Token, string NewPassword);
