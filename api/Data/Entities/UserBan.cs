namespace HackerManChat.Api.Data.Entities;

public class UserBan
{
    public Guid BannerId { get; set; }
    public ApplicationUser Banner { get; set; } = null!;
    public Guid BannedId { get; set; }
    public ApplicationUser Banned { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
