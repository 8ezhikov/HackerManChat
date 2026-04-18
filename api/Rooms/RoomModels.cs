using HackerManChat.Api.Data.Entities;

namespace HackerManChat.Api.Rooms;

public record CreateRoomRequest(string Name, string? Description, string Visibility);
public record UpdateRoomRequest(string? Name, string? Description, string? Visibility);
public record InviteRequest(Guid UserId);

public record RoomDto(Guid Id, string Name, string? Description, string Visibility, Guid OwnerId, DateTime CreatedAt, int MemberCount = 0);
public record RoomMemberDto(Guid UserId, string Username, string DisplayName, string Role, DateTime JoinedAt);
public record RoomBanDto(Guid UserId, string Username, Guid BannedById, DateTime CreatedAt);

public static class RoomMappings
{
    public static RoomDto ToDto(this Room r, int memberCount = 0) =>
        new(r.Id, r.Name, r.Description, r.Visibility.ToString().ToLower(), r.OwnerId, r.CreatedAt, memberCount);
}
