namespace HackerManChat.Api.Data.Entities;

public enum FriendshipStatus { Pending, Accepted }

public class Friendship
{
    public Guid RequesterId { get; set; }
    public ApplicationUser Requester { get; set; } = null!;
    public Guid AddresseeId { get; set; }
    public ApplicationUser Addressee { get; set; } = null!;
    public FriendshipStatus Status { get; set; } = FriendshipStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
