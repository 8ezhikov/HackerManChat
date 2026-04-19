using HackerManChat.Api.Data.Entities;

namespace HackerManChat.Api.Friends;

public record FriendRequestDto(Guid UserId, string Username, string DisplayName, string? Message, DateTime SentAt);
public record FriendDto(Guid UserId, string Username, string DisplayName, DateTime FriendsSince);
public record BannedUserDto(Guid UserId, string Username, DateTime BannedAt);

public static class FriendMappings
{
    public static FriendRequestDto ToRequestDto(this Friendship f, ApplicationUser requester) =>
        new(requester.Id, requester.UserName!, requester.DisplayName, f.Message, f.CreatedAt);

    public static FriendDto ToFriendDto(this Friendship f, ApplicationUser other) =>
        new(other.Id, other.UserName!, other.DisplayName, f.CreatedAt);
}
