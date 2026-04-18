namespace HackerManChat.Api.Data.Entities;

public class RoomBan
{
    public Guid RoomId { get; set; }
    public Room Room { get; set; } = null!;
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public Guid BannedById { get; set; }
    public ApplicationUser BannedBy { get; set; } = null!;
    public string? Reason { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
