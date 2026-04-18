using HackerManChat.Api.Data.Entities;

namespace HackerManChat.Api.Messages;

public record SendMessageBody(string Content, Guid? ReplyToId);
public record EditMessageBody(string Content);

public record MessageDto(
    Guid Id, Guid AuthorId, string AuthorUsername, string Content,
    DateTime CreatedAt, DateTime? EditedAt, bool IsDeleted, Guid? ReplyToId);

public static class MessageMappings
{
    public static MessageDto ToDto(this Message m) =>
        new(m.Id, m.AuthorId, m.Author.UserName!, m.Content, m.CreatedAt, m.EditedAt, m.IsDeleted, m.ReplyToId);
}
