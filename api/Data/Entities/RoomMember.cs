namespace HackerManChat.Api.Data.Entities;

public enum RoomMemberRole { Member, Admin }

public class RoomMember
{
    public Guid RoomId { get; set; }
    public Room Room { get; set; } = null!;
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public RoomMemberRole Role { get; set; } = RoomMemberRole.Member;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
