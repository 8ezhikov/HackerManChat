using System.Net.Mail;

namespace HackerManChat.Api.Auth;

public class MailService(IConfiguration config)
{
    private readonly string _host = config["Smtp:Host"] ?? "localhost";
    private readonly int _port = int.Parse(config["Smtp:Port"] ?? "1025");
    private readonly string _from = config["Smtp:From"] ?? "noreply@hackermanchat.local";

    public async Task SendPasswordResetAsync(string toEmail, string resetLink)
    {
        using var client = new SmtpClient(_host, _port) { EnableSsl = false };
        var msg = new MailMessage(_from, toEmail,
            "Reset your HackerManChat password",
            $"Click the link below to reset your password:\n\n{resetLink}\n\nThis link expires in 1 hour.");
        await client.SendMailAsync(msg);
    }
}
