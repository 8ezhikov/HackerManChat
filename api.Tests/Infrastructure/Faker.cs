using Bogus;

namespace HackerManChat.Api.Tests.Infrastructure;

public static class FakeData
{
    private static readonly Faker _faker = new();

    public static (string Email, string Username, string Password) NewUser()
    {
        var username = _faker.Internet.UserName().Replace(".", "_").Replace("-", "_");
        var trimmed = username[..Math.Min(20, username.Length)].Trim('_');
        return (
            _faker.Internet.Email(),
            trimmed + _faker.Random.AlphaNumeric(4),
            "TestPass1!"
        );
    }
}
