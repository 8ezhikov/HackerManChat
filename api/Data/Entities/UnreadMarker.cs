namespace HackerManChat.Api.Data.Entities;

public enum ChatKind { Room = 0, Dm = 1 }

public class UnreadMarker
{
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public ChatKind ChatKind { get; set; }
    public Guid ChatId { get; set; }
    public DateTime LastSeenAt { get; set; } = DateTime.MinValue;
}
