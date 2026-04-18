namespace HackerManChat.Api.Data.Entities;

public class PersonalChat
{
    public Guid Id { get; set; }
    // User1Id < User2Id enforced on creation to keep the unique constraint stable
    public Guid User1Id { get; set; }
    public ApplicationUser User1 { get; set; } = null!;
    public Guid User2Id { get; set; }
    public ApplicationUser User2 { get; set; } = null!;
    public bool IsFrozen { get; set; } // set when either user bans the other
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Message> Messages { get; set; } = new List<Message>();
}
