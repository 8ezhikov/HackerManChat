using HackerManChat.Api.Data.Entities;

namespace HackerManChat.Api.DMs;

public record OpenDmBody(Guid UserId);
public record SendMessageBody(string Content, Guid? ReplyToId);
public record EditMessageBody(string Content);

public record DmDto(Guid Id, Guid OtherUserId, string OtherUsername, string OtherDisplayName, bool IsFrozen, DateTime CreatedAt);
public record MessageDto(
    Guid Id, Guid AuthorId, string AuthorUsername, string Content,
    DateTime CreatedAt, DateTime? EditedAt, bool IsDeleted, Guid? ReplyToId);

public static class DmMappings
{
    public static DmDto ToDto(this PersonalChat pc, Guid myId) =>
        pc.User1Id == myId
            ? new(pc.Id, pc.User2Id, pc.User2.UserName!, pc.User2.DisplayName, pc.IsFrozen, pc.CreatedAt)
            : new(pc.Id, pc.User1Id, pc.User1.UserName!, pc.User1.DisplayName, pc.IsFrozen, pc.CreatedAt);

    public static MessageDto ToDto(this Message m) =>
        new(m.Id, m.AuthorId, m.Author.UserName!, m.Content, m.CreatedAt, m.EditedAt, m.IsDeleted, m.ReplyToId);
}
