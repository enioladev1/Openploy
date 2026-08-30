import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "../columns";
import { organizations } from "./orgs";

export const notificationChannelTypeEnum = pgEnum("notification_channel_type", ["telegram", "smtp", "resend"]);

export const notificationTestStatusEnum = pgEnum("notification_test_status", ["success", "failed"]);

/**
 * One row per notification destination. Columns are flat and per-type
 * (nullable outside their own type) rather than one JSON config blob - same
 * convention as backup_storage_configs: only the fields that are genuinely
 * secret (bot token, SMTP password, Resend API key) get their own encrypted
 * column, everything else stays plain so it can be listed/edited without
 * decrypting anything.
 */
export const notificationChannels = pgTable(
  "notification_channels",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    type: notificationChannelTypeEnum("type").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),

    // Telegram
    telegramChatId: varchar("telegram_chat_id", { length: 100 }),
    telegramBotTokenEncrypted: text("telegram_bot_token_encrypted"),

    // SMTP
    smtpHost: varchar("smtp_host", { length: 255 }),
    smtpPort: integer("smtp_port"),
    smtpSecure: boolean("smtp_secure"),
    smtpUsername: varchar("smtp_username", { length: 255 }),
    smtpPasswordEncrypted: text("smtp_password_encrypted"),
    smtpFromEmail: varchar("smtp_from_email", { length: 320 }),
    smtpFromName: varchar("smtp_from_name", { length: 200 }),
    smtpToEmail: varchar("smtp_to_email", { length: 320 }),

    // Resend
    resendApiKeyEncrypted: text("resend_api_key_encrypted"),
    resendFromEmail: varchar("resend_from_email", { length: 320 }),
    resendFromName: varchar("resend_from_name", { length: 200 }),
    resendToEmail: varchar("resend_to_email", { length: 320 }),

    // Event subscriptions - a fixed, small set of events, so plain booleans
    // rather than a join table or an array column.
    notifyOnDeploymentSuccess: boolean("notify_on_deployment_success").notNull().default(false),
    notifyOnDeploymentFailed: boolean("notify_on_deployment_failed").notNull().default(true),
    notifyOnBackupSuccess: boolean("notify_on_backup_success").notNull().default(false),
    notifyOnBackupFailed: boolean("notify_on_backup_failed").notNull().default(true),

    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestStatus: notificationTestStatusEnum("last_test_status"),
    lastTestError: text("last_test_error"),

    ...timestamps(),
  },
  (table) => [index("notification_channels_org_idx").on(table.organizationId)],
);
