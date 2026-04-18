namespace HackerManChat.Api.Data.Entities;

public class Message
{
    public Guid Id { get; set; }
    public Guid? RoomId { get; set; }
    public Room? Room { get; set; }
    public Guid? PersonalChatId { get; set; }
    public PersonalChat? PersonalChat { get; set; }
    public Guid AuthorId { get; set; }
    public ApplicationUser Author { get; set; } = null!;
    public string Content { get; set; } = string.Empty;
    public Guid? ReplyToId { get; set; }
    public Message? ReplyTo { get; set; }
    public DateTime? EditedAt { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Attachment> Attachments { get; set; } = new List<Attachment>();
}
