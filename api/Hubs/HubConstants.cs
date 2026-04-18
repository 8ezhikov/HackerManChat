namespace HackerManChat.Api.Hubs;

public static class HubConstants
{
    public static string RoomGroup(Guid id) => $"room:{id}";
    public static string UserGroup(Guid id) => $"user:{id}";
    public static string FriendOfGroup(Guid id) => $"friend-of:{id}";

    public const string RoomMessageReceived = "RoomMessageReceived";
    public const string DmMessageReceived   = "DmMessageReceived";
    public const string RoomMessageEdited   = "RoomMessageEdited";
    public const string DmMessageEdited     = "DmMessageEdited";
    public const string RoomMessageDeleted  = "RoomMessageDeleted";
    public const string DmMessageDeleted    = "DmMessageDeleted";
    public const string PresenceChanged     = "PresenceChanged";
    public const string FriendPresences     = "FriendPresences";
}
