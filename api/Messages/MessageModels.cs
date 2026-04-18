using HackerManChat.Api.Data.Entities;

namespace HackerManChat.Api.Messages;

public record SendMessageBody(string Content, Guid? ReplyToId);
public record EditMessageBody(string Content);

public record AttachmentDto(Guid Id, string OriginalFileName, long SizeBytes, string ContentType);

public record MessageDto(
    Guid Id, Guid AuthorId, string AuthorUsername, string Content,
    DateTime CreatedAt, DateTime? EditedAt, bool IsDeleted, Guid? ReplyToId,
    string? ReplyToAuthor, string? ReplyToContent,
    IReadOnlyList<AttachmentDto> Attachments);

public static class MessageMappings
{
    public static MessageDto ToDto(this Message m) =>
        new(m.Id, m.AuthorId, m.Author.UserName!, m.Content, m.CreatedAt, m.EditedAt, m.IsDeleted, m.ReplyToId,
            m.ReplyTo?.Author?.UserName, m.ReplyTo?.Content,
            m.Attachments.Select(a => new AttachmentDto(a.Id, a.OriginalFileName, a.SizeBytes, a.ContentType)).ToList());
}
