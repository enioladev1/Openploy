import "server-only";
import { and, eq } from "drizzle-orm";
import { notificationChannels } from "@openploy/db";
import { decryptSecret, encryptSecret, type EncryptedSecret } from "@openploy/crypto";
import { testNotificationConnection } from "@openploy/notifications";
import type {
  CreateNotificationChannelInput,
  NotificationChannelConfig,
  UpdateNotificationChannelConfig,
  UpdateNotificationChannelInput,
} from "@openploy/shared";
import { getEffectiveBaseUrl } from "../base-url";
import { db } from "../db";
import { NotFoundError, ValidationError } from "../errors";

function encrypt(value: string): string {
  return JSON.stringify(encryptSecret(value));
}

function decrypt(value: string): string {
  return decryptSecret(JSON.parse(value) as EncryptedSecret);
}

// Every type-specific column, cleared by default so switching a channel's
// type on edit wipes the previous type's leftover data instead of leaving it
// stranded in the row.
const CLEARED_TYPE_COLUMNS = {
  telegramChatId: null,
  telegramBotTokenEncrypted: null,
  smtpHost: null,
  smtpPort: null,
  smtpSecure: null,
  smtpUsername: null,
  smtpPasswordEncrypted: null,
  smtpFromEmail: null,
  smtpFromName: null,
  smtpToEmail: null,
  resendApiKeyEncrypted: null,
  resendFromEmail: null,
  resendFromName: null,
  resendToEmail: null,
};

function configToColumns(config: NotificationChannelConfig) {
  if (config.kind === "telegram") {
    return {
      ...CLEARED_TYPE_COLUMNS,
      type: "telegram" as const,
      telegramChatId: config.chatId,
      telegramBotTokenEncrypted: encrypt(config.botToken),
    };
  }
  if (config.kind === "smtp") {
    return {
      ...CLEARED_TYPE_COLUMNS,
      type: "smtp" as const,
      smtpHost: config.host,
      smtpPort: config.port,
      smtpSecure: config.secure,
      smtpUsername: config.username,
      smtpPasswordEncrypted: encrypt(config.password),
      smtpFromEmail: config.fromEmail,
      smtpFromName: config.fromName,
      smtpToEmail: config.toEmail,
    };
  }
  return {
    ...CLEARED_TYPE_COLUMNS,
    type: "resend" as const,
    resendApiKeyEncrypted: encrypt(config.apiKey),
    resendFromEmail: config.fromEmail,
    resendFromName: config.fromName,
    resendToEmail: config.toEmail,
  };
}

/** Same as configToColumns, but secret fields are optional - blank means keep whatever is already encrypted on the row, and nothing gets encrypted (or even touched) unless a new secret was actually provided. */
function updateConfigToColumns(existing: typeof notificationChannels.$inferSelect, config: UpdateNotificationChannelConfig) {
  const isSameType = existing.type === config.kind;

  if (config.kind === "telegram") {
    if (!config.botToken && !isSameType) throw new ValidationError("Bot token is required");
    return {
      ...CLEARED_TYPE_COLUMNS,
      type: "telegram" as const,
      telegramChatId: config.chatId,
      telegramBotTokenEncrypted: config.botToken ? encrypt(config.botToken) : isSameType ? existing.telegramBotTokenEncrypted : null,
    };
  }
  if (config.kind === "smtp") {
    if (!config.password && !isSameType) throw new ValidationError("Password is required");
    return {
      ...CLEARED_TYPE_COLUMNS,
      type: "smtp" as const,
      smtpHost: config.host,
      smtpPort: config.port,
      smtpSecure: config.secure,
      smtpUsername: config.username,
      smtpPasswordEncrypted: config.password ? encrypt(config.password) : isSameType ? existing.smtpPasswordEncrypted : null,
      smtpFromEmail: config.fromEmail,
      smtpFromName: config.fromName,
      smtpToEmail: config.toEmail,
    };
  }
  if (!config.apiKey && !isSameType) throw new ValidationError("API key is required");
  return {
    ...CLEARED_TYPE_COLUMNS,
    type: "resend" as const,
    resendApiKeyEncrypted: config.apiKey ? encrypt(config.apiKey) : isSameType ? existing.resendApiKeyEncrypted : null,
    resendFromEmail: config.fromEmail,
    resendFromName: config.fromName,
    resendToEmail: config.toEmail,
  };
}

function rowToConfig(row: typeof notificationChannels.$inferSelect): NotificationChannelConfig {
  if (row.type === "telegram") {
    return {
      kind: "telegram",
      chatId: row.telegramChatId ?? "",
      botToken: row.telegramBotTokenEncrypted ? decrypt(row.telegramBotTokenEncrypted) : "",
    };
  }
  if (row.type === "smtp") {
    return {
      kind: "smtp",
      host: row.smtpHost ?? "",
      port: row.smtpPort ?? 587,
      secure: row.smtpSecure ?? false,
      username: row.smtpUsername ?? "",
      password: row.smtpPasswordEncrypted ? decrypt(row.smtpPasswordEncrypted) : "",
      fromEmail: row.smtpFromEmail ?? "",
      fromName: row.smtpFromName ?? "",
      toEmail: row.smtpToEmail ?? "",
    };
  }
  return {
    kind: "resend",
    apiKey: row.resendApiKeyEncrypted ? decrypt(row.resendApiKeyEncrypted) : "",
    fromEmail: row.resendFromEmail ?? "",
    fromName: row.resendFromName ?? "",
    toEmail: row.resendToEmail ?? "",
  };
}

const LIST_COLUMNS = {
  id: true,
  name: true,
  type: true,
  isEnabled: true,
  telegramChatId: true,
  smtpHost: true,
  smtpPort: true,
  smtpUsername: true,
  smtpFromEmail: true,
  smtpFromName: true,
  smtpToEmail: true,
  resendFromEmail: true,
  resendFromName: true,
  resendToEmail: true,
  notifyOnDeploymentSuccess: true,
  notifyOnDeploymentFailed: true,
  notifyOnBackupSuccess: true,
  notifyOnBackupFailed: true,
  lastTestedAt: true,
  lastTestStatus: true,
  lastTestError: true,
  createdAt: true,
} as const;

/** Never selects any *Encrypted column - the list view has no reason to touch a secret at all. */
export async function listNotificationChannels(organizationId: string) {
  return db.query.notificationChannels.findMany({
    where: eq(notificationChannels.organizationId, organizationId),
    columns: LIST_COLUMNS,
    orderBy: (channels, { desc }) => [desc(channels.createdAt)],
  });
}

export async function createNotificationChannel(organizationId: string, input: CreateNotificationChannelInput) {
  const [row] = await db
    .insert(notificationChannels)
    .values({
      organizationId,
      name: input.name,
      notifyOnDeploymentSuccess: input.notifyOnDeploymentSuccess,
      notifyOnDeploymentFailed: input.notifyOnDeploymentFailed,
      notifyOnBackupSuccess: input.notifyOnBackupSuccess,
      notifyOnBackupFailed: input.notifyOnBackupFailed,
      ...configToColumns(input.config),
    })
    .returning();
  if (!row) throw new Error("Failed to create notification channel");
  return row;
}

async function getOrgScopedNotificationChannel(organizationId: string, id: string) {
  const row = await db.query.notificationChannels.findFirst({
    where: and(eq(notificationChannels.id, id), eq(notificationChannels.organizationId, organizationId)),
  });
  if (!row) throw new NotFoundError("Notification channel not found");
  return row;
}

export async function updateNotificationChannel(organizationId: string, input: UpdateNotificationChannelInput) {
  const existing = await getOrgScopedNotificationChannel(organizationId, input.id);
  const [row] = await db
    .update(notificationChannels)
    .set({
      name: input.name,
      isEnabled: input.isEnabled,
      notifyOnDeploymentSuccess: input.notifyOnDeploymentSuccess,
      notifyOnDeploymentFailed: input.notifyOnDeploymentFailed,
      notifyOnBackupSuccess: input.notifyOnBackupSuccess,
      notifyOnBackupFailed: input.notifyOnBackupFailed,
      ...updateConfigToColumns(existing, input.config),
    })
    .where(eq(notificationChannels.id, input.id))
    .returning();
  if (!row) throw new Error("Failed to update notification channel");
  return row;
}

export async function deleteNotificationChannel(organizationId: string, id: string) {
  await getOrgScopedNotificationChannel(organizationId, id);
  await db.delete(notificationChannels).where(eq(notificationChannels.id, id));
}

/** Tests a config that hasn't been saved yet (create modal, or edit modal where the user typed a fresh secret) - never touches the DB. */
export async function testNotificationConfig(config: NotificationChannelConfig) {
  try {
    await testNotificationConnection(config, await getEffectiveBaseUrl());
    return { success: true as const };
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** Tests the currently-saved config for a channel (edit modal left the secret blank, or the list's own Test button) - decrypts server-side, persists the result, never returns the secret to the client. */
export async function testSavedNotificationChannel(organizationId: string, id: string) {
  const row = await getOrgScopedNotificationChannel(organizationId, id);
  const config = rowToConfig(row);

  try {
    await testNotificationConnection(config, await getEffectiveBaseUrl());
    await db
      .update(notificationChannels)
      .set({ lastTestedAt: new Date(), lastTestStatus: "success", lastTestError: null })
      .where(eq(notificationChannels.id, id));
    return { success: true as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db
      .update(notificationChannels)
      .set({ lastTestedAt: new Date(), lastTestStatus: "failed", lastTestError: message })
      .where(eq(notificationChannels.id, id));
    return { success: false as const, error: message };
  }
}
