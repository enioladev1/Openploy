import type { NotificationChannelConfig } from "@openploy/shared";
import { sendResendEmail } from "./resend";
import { sendSmtpEmail } from "./smtp";
import { sendTelegramMessage } from "./telegram";

// No context/dashboardUrl available for a not-yet-saved config being tested,
// unlike buildEmailHtml - caller resolves the effective base URL the same
// way apps/agent/src/notifications.ts does (DB-stored platform domain first).
function buildTestEmailHtml(baseUrl: string): string {
  const logoUrl = `${baseUrl}/logos/brand/openploy-logo.png`;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;border:1px solid #e4e4e7;overflow:hidden;">
            <tr>
              <td align="center" style="padding:28px 32px 0;">
                <img src="${logoUrl}" alt="Openploy" height="28" style="height:28px;width:auto;display:block;margin:0 auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 20px;">
                <span style="display:inline-block;background:#f0fdf4;color:#059669;font-size:13px;font-weight:600;padding:4px 12px;border-radius:999px;">✅ Test notification</span>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <h1 style="margin:0 0 8px;font-size:20px;line-height:1.4;color:#0a0a0a;font-weight:600;">This channel is connected</h1>
                <p style="margin:0;font-size:14px;color:#71717a;">If you can read this, this notification channel is set up correctly.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Sends a real test message through the given (not-yet-saved) config - the same send path a real event notification uses. */
export async function testNotificationConnection(config: NotificationChannelConfig, baseUrl: string): Promise<void> {
  if (config.kind === "telegram") {
    await sendTelegramMessage(
      { botToken: config.botToken, chatId: config.chatId },
      "✅ <b>Test notification</b>\nThis Openploy Telegram channel is connected.",
    );
    return;
  }
  if (config.kind === "smtp") {
    await sendSmtpEmail(
      {
        host: config.host,
        port: config.port,
        secure: config.secure,
        username: config.username,
        password: config.password,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        toEmail: config.toEmail,
      },
      "[Openploy] Test notification",
      buildTestEmailHtml(baseUrl),
    );
    return;
  }
  await sendResendEmail(
    { apiKey: config.apiKey, fromEmail: config.fromEmail, fromName: config.fromName, toEmail: config.toEmail },
    "[Openploy] Test notification",
    buildTestEmailHtml(baseUrl),
  );
}
