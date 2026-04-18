using HackerManChat.Api.Data.Entities;

namespace HackerManChat.Api.DMs;

public record OpenDmBody(Guid UserId);

public record DmDto(Guid Id, Guid OtherUserId, string OtherUsername, string OtherDisplayName, bool IsFrozen, DateTime CreatedAt);

public static class DmMappings
{
    public static DmDto ToDto(this PersonalChat pc, Guid myId) =>
        pc.User1Id == myId
            ? new(pc.Id, pc.User2Id, pc.User2.UserName!, pc.User2.DisplayName, pc.IsFrozen, pc.CreatedAt)
            : new(pc.Id, pc.User1Id, pc.User1.UserName!, pc.User1.DisplayName, pc.IsFrozen, pc.CreatedAt);
}
