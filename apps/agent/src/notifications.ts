import { and, eq } from "drizzle-orm";
import { notificationChannels } from "@openploy/db";
import { decryptSecret, type EncryptedSecret } from "@openploy/crypto";
import {
  buildEmailHtml,
  buildEmailSubject,
  buildTelegramMessage,
  sendResendEmail,
  sendSmtpEmail,
  sendTelegramMessage,
  type NotificationContext,
} from "@openploy/notifications";
import { enqueueJob } from "@openploy/queue";
import { JOB_DISPATCH_NOTIFICATION, type NotificationEvent } from "@openploy/shared";
import { getServiceNotificationContext } from "@openploy/db";
import { db } from "./db";

function decrypt(value: string): string {
  return decryptSecret(JSON.parse(value) as EncryptedSecret);
}

/**
 * Links back to the project page (services are shown inline there, there's no
 * standalone per-service route). Prefers the admin-configured dashboard
 * domain over APP_BASE_URL, which never changes after install - same fix as
 * apps/web/src/server/base-url.ts's getEffectiveBaseUrl().
 */
async function buildDashboardUrl(projectId: string): Promise<string> {
  const domain = await db.query.platformDomains.findFirst();
  const base = domain ? `https://${domain.host}` : (process.env.APP_BASE_URL ?? "http://localhost:3000");
  return `${base.replace(/\/$/, "")}/projects/${projectId}`;
}

/**
 * Resolves org/project/service context for a deploy/backup event from just a
 * serviceId, and enqueues the notification - returns silently (logs) if the
 * service can't be resolved, since a dangling serviceId must never fail the
 * deploy/backup job that's reporting its own outcome.
 */
export async function notifyServiceEvent(
  serviceId: string,
  event: NotificationEvent,
  extra?: { durationSeconds?: number | undefined },
): Promise<void> {
  const context = await getServiceNotificationContext(db, serviceId);
  if (!context) {
    console.error(`[agent] cannot send notification for service ${serviceId}: service not found`);
    return;
  }
  await notifyEvent(context.organizationId, event, {
    serviceName: context.serviceName,
    projectName: context.projectName,
    dashboardUrl: await buildDashboardUrl(context.projectId),
    durationSeconds: extra?.durationSeconds,
  });
}

const EVENT_FLAG_COLUMN = {
  deployment_success: "notifyOnDeploymentSuccess",
  deployment_failed: "notifyOnDeploymentFailed",
  backup_success: "notifyOnBackupSuccess",
  backup_failed: "notifyOnBackupFailed",
} as const satisfies Record<NotificationEvent, keyof typeof notificationChannels.$inferSelect>;

type NotificationChannelRow = typeof notificationChannels.$inferSelect;

// Type-specific columns are guaranteed populated together by
// notification-service.ts's create/update - a channel's type never changes
// without also rewriting all of that type's columns, so non-null assertions
// here reflect a real invariant, not an unchecked assumption.
async function sendToChannel(channel: NotificationChannelRow, context: NotificationContext): Promise<void> {
  if (channel.type === "telegram") {
    await sendTelegramMessage(
      { botToken: decrypt(channel.telegramBotTokenEncrypted!), chatId: channel.telegramChatId! },
      buildTelegramMessage(context),
    );
    return;
  }
  if (channel.type === "smtp") {
    await sendSmtpEmail(
      {
        host: channel.smtpHost!,
        port: channel.smtpPort!,
        secure: channel.smtpSecure!,
        username: channel.smtpUsername!,
        password: decrypt(channel.smtpPasswordEncrypted!),
        fromEmail: channel.smtpFromEmail!,
        fromName: channel.smtpFromName!,
        toEmail: channel.smtpToEmail!,
      },
      buildEmailSubject(context),
      buildEmailHtml(context),
    );
    return;
  }
  await sendResendEmail(
    {
      apiKey: decrypt(channel.resendApiKeyEncrypted!),
      fromEmail: channel.resendFromEmail!,
      fromName: channel.resendFromName!,
      toEmail: channel.resendToEmail!,
    },
    buildEmailSubject(context),
    buildEmailHtml(context),
  );
}

/**
 * Fans out to every enabled channel subscribed to this event for the org.
 * Fire-and-forget from the caller's perspective (see workers/dispatch-notification.ts) -
 * one channel's failure (bad token, unreachable SMTP host) is logged and
 * skipped, never allowed to fail the others or bubble up to the deploy/backup
 * job that triggered this.
 */
export async function dispatchNotification(
  organizationId: string,
  event: NotificationEvent,
  context: Omit<NotificationContext, "event">,
): Promise<void> {
  const flagColumn = EVENT_FLAG_COLUMN[event];
  const channels = await db.query.notificationChannels.findMany({
    where: and(eq(notificationChannels.organizationId, organizationId), eq(notificationChannels.isEnabled, true)),
  });

  const fullContext: NotificationContext = { ...context, event };

  await Promise.all(
    channels
      .filter((channel) => channel[flagColumn])
      .map((channel) =>
        sendToChannel(channel, fullContext).catch((err) => {
          console.error(`[agent] notification channel ${channel.id} (${channel.type}) failed:`, err);
        }),
      ),
  );
}

/**
 * Called from the deploy/backup workers at their success/failure points.
 * Enqueues onto the same pg-boss queue as everything else and is awaited
 * only for the (fast, reliable) insert itself - queuing failure is caught
 * and logged, never thrown, so a notification problem can never fail the
 * deploy or backup that triggered it.
 */
export async function notifyEvent(
  organizationId: string,
  event: NotificationEvent,
  context: Omit<NotificationContext, "event">,
): Promise<void> {
  try {
    await enqueueJob(JOB_DISPATCH_NOTIFICATION, { organizationId, event, context });
  } catch (err) {
    console.error(`[agent] failed to enqueue notification (${event}) for org ${organizationId}:`, err);
  }
}
