import "server-only";
import { eq } from "drizzle-orm";
import { backupStorageConfigs, databaseBackupSchedules, databaseServices, getOrgScopedService } from "@openploy/db";
import {
  backupableDbEngineSchema,
  isBackupRunStuck,
  JOB_RUN_DATABASE_BACKUP,
  type CreateBackupScheduleInput,
} from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { db } from "../db";
import { NotFoundError, ValidationError } from "../errors";

/** Caller MUST resolve serviceId through getOrgScopedService before calling this. */
export async function createBackupSchedule(organizationId: string, input: CreateBackupScheduleInput) {
  const dbService = await db.query.databaseServices.findFirst({
    where: eq(databaseServices.serviceId, input.serviceId),
  });
  if (!dbService) throw new NotFoundError("Database service not found");
  if (!backupableDbEngineSchema.safeParse(dbService.engine).success) {
    throw new ValidationError(`Scheduled backups aren't supported for ${dbService.engine} yet`);
  }

  const storageConfig = await db.query.backupStorageConfigs.findFirst({
    where: eq(backupStorageConfigs.id, input.backupStorageConfigId),
  });
  if (!storageConfig || storageConfig.organizationId !== organizationId) {
    throw new NotFoundError("Backup storage config not found");
  }

  const [row] = await db
    .insert(databaseBackupSchedules)
    .values({
      serviceId: input.serviceId,
      backupStorageConfigId: input.backupStorageConfigId,
      name: input.name,
      frequency: input.frequency,
      retentionCount: input.retentionCount,
    })
    .returning();
  if (!row) throw new Error("Failed to create backup schedule");
  return row;
}

/** Caller MUST resolve serviceId through getOrgScopedService before calling this. No Drizzle relations() are defined anywhere in this schema - a manual join, not the with: relational API, is this codebase's own convention (see domain-service.ts's listDomains). */
export async function listBackupSchedules(serviceId: string) {
  const rows = await db
    .select({
      id: databaseBackupSchedules.id,
      name: databaseBackupSchedules.name,
      frequency: databaseBackupSchedules.frequency,
      retentionCount: databaseBackupSchedules.retentionCount,
      isEnabled: databaseBackupSchedules.isEnabled,
      lastRunAt: databaseBackupSchedules.lastRunAt,
      lastRunStatus: databaseBackupSchedules.lastRunStatus,
      lastRunError: databaseBackupSchedules.lastRunError,
      backupStorageConfigId: databaseBackupSchedules.backupStorageConfigId,
      backupStorageName: backupStorageConfigs.name,
    })
    .from(databaseBackupSchedules)
    .innerJoin(backupStorageConfigs, eq(backupStorageConfigs.id, databaseBackupSchedules.backupStorageConfigId))
    .where(eq(databaseBackupSchedules.serviceId, serviceId));
  return rows;
}

async function getOrgScopedBackupSchedule(organizationId: string, id: string) {
  const row = await db.query.databaseBackupSchedules.findFirst({ where: eq(databaseBackupSchedules.id, id) });
  if (!row) throw new NotFoundError("Backup schedule not found");
  const service = await getOrgScopedService(db, organizationId, row.serviceId);
  if (!service) throw new NotFoundError("Backup schedule not found");
  return row;
}

export async function setBackupScheduleEnabled(organizationId: string, id: string, isEnabled: boolean) {
  await getOrgScopedBackupSchedule(organizationId, id);
  await db.update(databaseBackupSchedules).set({ isEnabled }).where(eq(databaseBackupSchedules.id, id));
}

export async function deleteBackupSchedule(organizationId: string, id: string) {
  await getOrgScopedBackupSchedule(organizationId, id);
  await db.delete(databaseBackupSchedules).where(eq(databaseBackupSchedules.id, id));
}

/** Runs a schedule immediately instead of waiting for its next due tick - claims it the same way check-due-backups does, so the two can never double-trigger the same run. */
export async function triggerBackupNow(organizationId: string, id: string) {
  const schedule = await getOrgScopedBackupSchedule(organizationId, id);
  if (schedule.lastRunStatus === "running" && !isBackupRunStuck(schedule.lastRunStatus, schedule.updatedAt)) {
    throw new ValidationError("A backup is already running for this schedule");
  }

  await db.update(databaseBackupSchedules).set({ lastRunStatus: "running" }).where(eq(databaseBackupSchedules.id, id));
  await enqueueJob(JOB_RUN_DATABASE_BACKUP, { scheduleId: id });
}
