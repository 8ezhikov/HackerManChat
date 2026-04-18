namespace HackerManChat.Api.Data.Entities;

public enum RoomVisibility { Public, Private }

public class Room
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid OwnerId { get; set; }
    public ApplicationUser Owner { get; set; } = null!;
    public RoomVisibility Visibility { get; set; } = RoomVisibility.Public;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<RoomMember> Members { get; set; } = new List<RoomMember>();
    public ICollection<RoomBan> Bans { get; set; } = new List<RoomBan>();
    public ICollection<Message> Messages { get; set; } = new List<Message>();
}
