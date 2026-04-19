using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HackerManChat.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFriendshipMessage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Message",
                table: "Friendships",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Message",
                table: "Friendships");
        }
    }
}
