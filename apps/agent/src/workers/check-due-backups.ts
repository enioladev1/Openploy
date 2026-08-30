import { eq } from "drizzle-orm";
import { databaseBackupSchedules } from "@openploy/db";
import { isBackupRunStuck, JOB_RUN_DATABASE_BACKUP } from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { db } from "../db";

const FREQUENCY_MS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  every_6_hours: 6 * 60 * 60 * 1000,
  every_12_hours: 12 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Runs every few minutes (see index.ts's scheduleJob call) and enqueues a
 * run-database-backup job for whichever schedules are due, re-derived fresh
 * from the DB every tick - see jobs.ts's checkDueBackupsJobSchema comment
 * for why this "tick" design was chosen over one native pg-boss cron entry
 * per schedule.
 */
export async function processCheckDueBackupsJob(): Promise<void> {
  const schedules = await db.query.databaseBackupSchedules.findMany({
    where: eq(databaseBackupSchedules.isEnabled, true),
  });

  const now = Date.now();
  for (const schedule of schedules) {
    const intervalMs = FREQUENCY_MS[schedule.frequency];
    if (!intervalMs) continue;

    const lastRunMs = schedule.lastRunAt?.getTime();
    const isStuck = isBackupRunStuck(schedule.lastRunStatus, schedule.updatedAt);
    if (schedule.lastRunStatus === "running" && !isStuck) continue;

    const due = lastRunMs === undefined || now - lastRunMs >= intervalMs || isStuck;
    if (!due) continue;

    // Claimed immediately (before the run job even starts) so a second tick
    // landing before it starts can't double-trigger the same schedule.
    await db
      .update(databaseBackupSchedules)
      .set({ lastRunStatus: "running" })
      .where(eq(databaseBackupSchedules.id, schedule.id));
    await enqueueJob(JOB_RUN_DATABASE_BACKUP, { scheduleId: schedule.id });
  }
}
