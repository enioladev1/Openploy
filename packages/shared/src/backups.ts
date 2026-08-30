import { z } from "zod";

export const backupProviderSchema = z.enum(["aws-s3", "cloudflare-r2", "s3-compatible"]);

// Endpoint is always user-supplied, never derived/hardcoded from provider -
// the "correct" endpoint for a given provider can vary (regional endpoints,
// VPC/private endpoints, a provider-compatible mirror, etc.), so guessing it
// server-side would silently point at the wrong place for anyone not on the
// single default we might assume.
const backupStorageBase = z.object({
  name: z.string().min(1).max(200),
  endpoint: z.string().url().max(500),
  bucket: z.string().min(1).max(255),
  pathPrefix: z
    .string()
    .max(500)
    .default("")
    .transform((value) => value.replace(/^\/+|\/+$/g, "")),
  accessKeyId: z.string().min(1).max(255),
  secretAccessKey: z.string().min(1).max(1000),
});

// "provider" beyond this point only picks which extra fields the UI shows
// (region default, forcePathStyle) - see backup-storage-service.ts.
export const backupStorageInputSchema = z.discriminatedUnion("provider", [
  backupStorageBase.extend({
    provider: z.literal("aws-s3"),
    region: z.string().min(1).max(100),
  }),
  backupStorageBase.extend({
    provider: z.literal("cloudflare-r2"),
    region: z.string().min(1).max(100).default("auto"),
  }),
  backupStorageBase.extend({
    provider: z.literal("s3-compatible"),
    region: z.string().min(1).max(100).default("auto"),
    forcePathStyle: z.boolean().default(true),
  }),
]);
export type BackupStorageInput = z.infer<typeof backupStorageInputSchema>;

export const backupFrequencySchema = z.enum(["hourly", "every_6_hours", "every_12_hours", "daily", "weekly"]);

// Database engines with a real, safe dump path today - see run-database-backup.ts's
// per-engine branches in apps/agent. Not every dbEngineSchema value is backup-able yet:
// ClickHouse needs a configured backup disk or a third-party tool to do this safely,
// so it's deliberately excluded rather than shipping something fragile.
export const backupableDbEngineSchema = z.enum(["postgres", "mysql", "redis", "mariadb", "mongodb"]);

export const createBackupScheduleInputSchema = z.object({
  serviceId: z.string().uuid(),
  backupStorageConfigId: z.string().uuid(),
  name: z.string().min(1).max(200),
  frequency: backupFrequencySchema,
  // Null/omitted = keep every backup forever.
  retentionCount: z.number().int().min(1).max(1000).nullable().default(null),
});
export type CreateBackupScheduleInput = z.infer<typeof createBackupScheduleInputSchema>;

// If a run is still "running" after this long, treat it as abandoned (most
// likely the agent crashed/restarted mid-job) rather than leave the schedule
// stuck forever - shared by the periodic due-check tick (apps/agent) and the
// manual "Backup now" trigger (apps/web), which both need the same recovery
// rule so a stuck run is never permanently un-retriggerable from either path.
//
// Deliberately LONGER than JOB_RUN_DATABASE_BACKUP's own 4h expireInHours
// (see apps/agent/src/index.ts): a backup that's legitimately still running
// must never be declared abandoned and re-triggered underneath itself, so
// this only fires once pg-boss has already given up on the job for certain.
export const STUCK_BACKUP_RUN_THRESHOLD_MS = 6 * 60 * 60 * 1000;

// updatedAt, not lastRunAt: lastRunAt only gets set once a run actually
// *completes* (see markResult in run-database-backup.ts), so a schedule
// that's never finished a run has lastRunAt = null and could never be
// detected as stuck by it - updatedAt is bumped by the very same write that
// flips status to "running", so it always reflects when this run started.
export function isBackupRunStuck(lastRunStatus: string | null, updatedAt: Date | null): boolean {
  if (lastRunStatus !== "running" || !updatedAt) return false;
  return Date.now() - updatedAt.getTime() > STUCK_BACKUP_RUN_THRESHOLD_MS;
}
