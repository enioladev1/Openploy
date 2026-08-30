import type { NotificationEvent } from "@openploy/shared";

export interface NotificationContext {
  event: NotificationEvent;
  serviceName: string;
  projectName: string;
  dashboardUrl: string;
  durationSeconds?: number | undefined;
}

// Service/project names are user-controlled (a repo name, a typed project
// name) - never interpolated raw into Telegram's HTML parse_mode or an email
// body, since either could otherwise break the markup or inject content.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

interface EventMeta {
  isFailure: boolean;
  subject: string;
  emoji: string;
}

const EVENT_META = {
  deployment_success: { isFailure: false, subject: "Deployment succeeded", emoji: "✅" },
  deployment_failed: { isFailure: true, subject: "Deployment failed", emoji: "❌" },
  backup_success: { isFailure: false, subject: "Backup succeeded", emoji: "✅" },
  backup_failed: { isFailure: true, subject: "Backup failed", emoji: "❌" },
} as const satisfies Record<NotificationEvent, EventMeta>;

export function buildTelegramMessage(context: NotificationContext): string {
  const meta: EventMeta = EVENT_META[context.event];
  const lines = [
    `${meta.emoji} <b>${escapeHtml(meta.subject)}</b>`,
    `Project: <b>${escapeHtml(context.projectName)}</b>`,
    `Service: <b>${escapeHtml(context.serviceName)}</b>`,
  ];
  if (context.durationSeconds !== undefined) lines.push(`Duration: ${formatDuration(context.durationSeconds)}`);
  lines.push("", `<a href="${context.dashboardUrl}">View in dashboard</a>`);
  return lines.join("\n");
}

export function buildEmailSubject(context: NotificationContext): string {
  return `[Openploy] ${EVENT_META[context.event].subject}: ${context.serviceName}`;
}

/**
 * Table-based layout with inline styles throughout, deliberately - email
 * clients (Outlook especially) strip <style> blocks and don't support
 * flexbox/grid, so anything modern-CSS silently breaks. Kept to the same
 * black/white minimalist look as the dashboard itself.
 */
export function buildEmailHtml(context: NotificationContext): string {
  const meta = EVENT_META[context.event];
  const accentColor = meta.isFailure ? "#dc2626" : "#059669";
  const badgeBg = meta.isFailure ? "#fef2f2" : "#f0fdf4";
  // Absolute URL required - email clients fetch images from the recipient's
  // device, not our server, so a relative path would resolve against nothing.
  const logoUrl = `${new URL(context.dashboardUrl).origin}/logos/brand/openploy-logo.png`;

  const durationRow = context.durationSeconds !== undefined
    ? `
                  <tr>
                    <td style="padding:4px 0;color:#71717a;font-size:14px;">Duration</td>
                    <td style="padding:4px 0;color:#0a0a0a;font-size:14px;text-align:right;font-weight:500;">${formatDuration(context.durationSeconds)}</td>
                  </tr>`
    : "";

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
                <span style="display:inline-block;background:${badgeBg};color:${accentColor};font-size:13px;font-weight:600;padding:4px 12px;border-radius:999px;">
                  ${meta.emoji} ${escapeHtml(meta.subject)}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 20px;">
                <h1 style="margin:0;font-size:20px;line-height:1.4;color:#0a0a0a;font-weight:600;">${escapeHtml(context.serviceName)}</h1>
                <p style="margin:4px 0 0;font-size:14px;color:#71717a;">${escapeHtml(context.projectName)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e4e7;padding-top:16px;">
                  <tr>
                    <td style="padding:4px 0;color:#71717a;font-size:14px;">Event</td>
                    <td style="padding:4px 0;color:#0a0a0a;font-size:14px;text-align:right;font-weight:500;">${escapeHtml(meta.subject)}</td>
                  </tr>${durationRow}
                  <tr>
                    <td style="padding:4px 0;color:#71717a;font-size:14px;">Time</td>
                    <td style="padding:4px 0;color:#0a0a0a;font-size:14px;text-align:right;font-weight:500;">${new Date().toUTCString()}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <a href="${context.dashboardUrl}" style="display:inline-block;background:#0a0a0a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:12px;">View in dashboard</a>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #e4e4e7;">
                <span style="font-size:12px;color:#a1a1aa;">You're receiving this because a notification channel is subscribed to this event in your Openploy settings.</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
