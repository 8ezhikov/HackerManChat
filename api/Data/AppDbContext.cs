using HackerManChat.Api.Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace HackerManChat.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>(options)
{
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<RoomMember> RoomMembers => Set<RoomMember>();
    public DbSet<RoomBan> RoomBans => Set<RoomBan>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<PersonalChat> PersonalChats => Set<PersonalChat>();
    public DbSet<Friendship> Friendships => Set<Friendship>();
    public DbSet<UserBan> UserBans => Set<UserBan>();
    public DbSet<Attachment> Attachments => Set<Attachment>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        b.Entity<Session>(e =>
        {
            e.HasIndex(s => s.RefreshTokenHash).IsUnique();
            e.HasIndex(s => s.UserId);
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Room>(e =>
        {
            e.HasIndex(r => r.Name).IsUnique();
            e.HasOne(r => r.Owner).WithMany().HasForeignKey(r => r.OwnerId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<RoomMember>(e =>
        {
            e.HasKey(rm => new { rm.RoomId, rm.UserId });
            e.HasOne(rm => rm.Room).WithMany(r => r.Members).HasForeignKey(rm => rm.RoomId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(rm => rm.User).WithMany().HasForeignKey(rm => rm.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<RoomBan>(e =>
        {
            e.HasKey(rb => new { rb.RoomId, rb.UserId });
            e.HasOne(rb => rb.Room).WithMany(r => r.Bans).HasForeignKey(rb => rb.RoomId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(rb => rb.User).WithMany().HasForeignKey(rb => rb.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(rb => rb.BannedBy).WithMany().HasForeignKey(rb => rb.BannedById).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Message>(e =>
        {
            e.HasIndex(m => new { m.CreatedAt, m.Id }); // keyset pagination index
            e.Property(m => m.Content).HasMaxLength(3072);
            e.HasOne(m => m.Author).WithMany().HasForeignKey(m => m.AuthorId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(m => m.ReplyTo).WithMany().HasForeignKey(m => m.ReplyToId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(m => m.Room).WithMany(r => r.Messages).HasForeignKey(m => m.RoomId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(m => m.PersonalChat).WithMany(pc => pc.Messages).HasForeignKey(m => m.PersonalChatId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<PersonalChat>(e =>
        {
            e.HasIndex(pc => new { pc.User1Id, pc.User2Id }).IsUnique();
            e.HasOne(pc => pc.User1).WithMany().HasForeignKey(pc => pc.User1Id).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(pc => pc.User2).WithMany().HasForeignKey(pc => pc.User2Id).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Friendship>(e =>
        {
            e.HasKey(f => new { f.RequesterId, f.AddresseeId });
            e.HasOne(f => f.Requester).WithMany().HasForeignKey(f => f.RequesterId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(f => f.Addressee).WithMany().HasForeignKey(f => f.AddresseeId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<UserBan>(e =>
        {
            e.HasKey(ub => new { ub.BannerId, ub.BannedId });
            e.HasOne(ub => ub.Banner).WithMany().HasForeignKey(ub => ub.BannerId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(ub => ub.Banned).WithMany().HasForeignKey(ub => ub.BannedId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Attachment>(e =>
        {
            e.HasOne(a => a.Message).WithMany(m => m.Attachments).HasForeignKey(a => a.MessageId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
