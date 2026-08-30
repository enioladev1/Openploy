import { CronExpressionParser } from "cron-parser";
import { eq } from "drizzle-orm";
import { serviceCronJobs } from "@openploy/db";
import { JOB_RUN_CRON_JOB } from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { db } from "../db";

// If a run is still "running" after this long, treat it as abandoned (most
// likely the agent crashed/restarted mid-job) rather than leave the job
// permanently stuck - same reasoning as check-due-backups.ts.
const STUCK_RUNNING_THRESHOLD_MS = 2 * 60 * 60 * 1000;

/**
 * Runs every minute (see index.ts's scheduleJob call) and enqueues a
 * run-cron-job job for whichever service cron jobs are due, re-derived fresh
 * from the DB every tick - same "tick" design as check-due-backups.ts, for
 * the same reason (pg-boss ties one cron expression to one queue name).
 * Unlike backups' fixed frequency enum, due-ness here is computed by asking
 * cron-parser for the next fire time after the job's last run (or its
 * creation time, if it's never run) and checking whether that's now passed.
 */
export async function processCheckDueCronJobsJob(): Promise<void> {
  const jobs = await db.query.serviceCronJobs.findMany({
    where: eq(serviceCronJobs.isEnabled, true),
  });

  const now = Date.now();
  for (const job of jobs) {
    const isStuck =
      job.lastRunStatus === "running" &&
      job.lastRunAt !== null &&
      now - job.lastRunAt.getTime() > STUCK_RUNNING_THRESHOLD_MS;
    if (job.lastRunStatus === "running" && !isStuck) continue;

    let dueAt: Date;
    try {
      const referenceDate = job.lastRunAt ?? job.createdAt;
      dueAt = CronExpressionParser.parse(job.cronExpression, { currentDate: referenceDate }).next().toDate();
    } catch {
      // Malformed expression - shouldn't happen since createCronJob validates
      // it, but never let one bad row crash the tick for every other job.
      continue;
    }

    const due = dueAt.getTime() <= now || isStuck;
    if (!due) continue;

    // Claimed immediately (before the run job even starts) so a second tick
    // landing before it starts can't double-trigger the same job.
    await db.update(serviceCronJobs).set({ lastRunStatus: "running" }).where(eq(serviceCronJobs.id, job.id));
    await enqueueJob(JOB_RUN_CRON_JOB, { cronJobId: job.id });
  }
}
