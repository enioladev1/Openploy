import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "../columns";
import { organizations } from "./orgs";
import { services } from "./services";

export const backupProviderEnum = pgEnum("backup_provider", ["aws-s3", "cloudflare-r2", "s3-compatible"]);

/**
 * "provider" only drives which fields the UI shows (see backup-storage-service.ts's
 * resolveConnectionFields in apps/web) - once saved, the actual S3 client is
 * built from the resolved endpoint/region/forcePathStyle/bucket columns
 * alone, identically regardless of provider.
 */
export const backupStorageConfigs = pgTable(
  "backup_storage_configs",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    provider: backupProviderEnum("provider").notNull(),
    // Always user-supplied, never derived from provider - see packages/shared/src/backups.ts.
    endpoint: varchar("endpoint", { length: 500 }).notNull(),
    region: varchar("region", { length: 100 }).notNull(),
    bucket: varchar("bucket", { length: 255 }).notNull(),
    pathPrefix: varchar("path_prefix", { length: 500 }).notNull().default(""),
    forcePathStyle: boolean("force_path_style").notNull().default(false),
    accessKeyId: varchar("access_key_id", { length: 255 }).notNull(),
    // JSON-encoded EncryptedSecret (packages/crypto) - never plaintext at rest.
    secretAccessKeyEncrypted: text("secret_access_key_encrypted").notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    lastVerifyError: text("last_verify_error"),
    ...timestamps(),
  },
  (table) => [index("backup_storage_configs_org_idx").on(table.organizationId)],
);

// Frequency is a fixed set of intervals rather than a raw cron string - the
// UI never asks a user to write cron syntax; each value maps to one cron
// expression in apps/agent's scheduler (see run-database-backup.ts).
export const backupFrequencyEnum = pgEnum("backup_frequency", [
  "hourly",
  "every_6_hours",
  "every_12_hours",
  "daily",
  "weekly",
]);

export const backupRunStatusEnum = pgEnum("backup_run_status", ["running", "success", "failed"]);

/**
 * One row per scheduled backup job for a database service. A service can
 * have more than one (e.g. hourly to one bucket, weekly to another).
 * pg-boss's own cron scheduler (packages/queue's scheduleJob/unscheduleJob)
 * is the source of truth for *when* a run fires - this row is registered
 * with it by id at create/update/delete time, not re-derived on a timer here.
 */
export const databaseBackupSchedules = pgTable(
  "database_backup_schedules",
  {
    id: id(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    backupStorageConfigId: uuid("backup_storage_config_id")
      .notNull()
      .references(() => backupStorageConfigs.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    frequency: backupFrequencyEnum("frequency").notNull(),
    // Null = keep every backup forever. When set, a run deletes the oldest
    // objects under its own bucket folder beyond this count after uploading.
    retentionCount: integer("retention_count"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastRunStatus: backupRunStatusEnum("last_run_status"),
    lastRunError: text("last_run_error"),
    ...timestamps(),
  },
  (table) => [
    index("database_backup_schedules_service_idx").on(table.serviceId),
    index("database_backup_schedules_storage_idx").on(table.backupStorageConfigId),
  ],
);
