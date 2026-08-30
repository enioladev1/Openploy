import "server-only";
import { desc, eq } from "drizzle-orm";
import { getOrgScopedService, serviceCronJobRuns, serviceCronJobs } from "@openploy/db";
import { JOB_RUN_CRON_JOB, type CreateCronJobInput, type UpdateCronJobInput } from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { db } from "../db";
import { NotFoundError, ValidationError } from "../errors";

/** Caller MUST resolve serviceId through getOrgScopedService before calling this. */
export async function createCronJob(input: CreateCronJobInput) {
  const [row] = await db
    .insert(serviceCronJobs)
    .values({
      serviceId: input.serviceId,
      name: input.name,
      command: input.command,
      cronExpression: input.cronExpression,
    })
    .returning();
  if (!row) throw new Error("Failed to create cron job");
  return row;
}

/** Caller MUST resolve serviceId through getOrgScopedService before calling this. */
export async function listCronJobs(serviceId: string) {
  return db.query.serviceCronJobs.findMany({
    where: eq(serviceCronJobs.serviceId, serviceId),
    orderBy: (jobs, { desc }) => [desc(jobs.createdAt)],
  });
}

async function getOrgScopedCronJob(organizationId: string, id: string) {
  const row = await db.query.serviceCronJobs.findFirst({ where: eq(serviceCronJobs.id, id) });
  if (!row) throw new NotFoundError("Cron job not found");
  const service = await getOrgScopedService(db, organizationId, row.serviceId);
  if (!service) throw new NotFoundError("Cron job not found");
  return row;
}

/** Editing the schedule/command doesn't touch lastRunStatus or isEnabled - it only changes what the next run will do, same as editing any other config. */
export async function updateCronJob(organizationId: string, input: UpdateCronJobInput) {
  await getOrgScopedCronJob(organizationId, input.id);
  const [row] = await db
    .update(serviceCronJobs)
    .set({ name: input.name, command: input.command, cronExpression: input.cronExpression })
    .where(eq(serviceCronJobs.id, input.id))
    .returning();
  if (!row) throw new Error("Failed to update cron job");
  return row;
}

export async function setCronJobEnabled(organizationId: string, id: string, isEnabled: boolean) {
  await getOrgScopedCronJob(organizationId, id);
  await db.update(serviceCronJobs).set({ isEnabled }).where(eq(serviceCronJobs.id, id));
}

export async function deleteCronJob(organizationId: string, id: string) {
  await getOrgScopedCronJob(organizationId, id);
  await db.delete(serviceCronJobs).where(eq(serviceCronJobs.id, id));
}

/** Runs a job immediately instead of waiting for its next due tick - claims it the same way check-due-cron-jobs does, so the two can never double-trigger the same run. */
export async function triggerCronJobNow(organizationId: string, id: string) {
  const job = await getOrgScopedCronJob(organizationId, id);
  if (job.lastRunStatus === "running") {
    throw new ValidationError("This cron job is already running");
  }

  await db.update(serviceCronJobs).set({ lastRunStatus: "running" }).where(eq(serviceCronJobs.id, id));
  await enqueueJob(JOB_RUN_CRON_JOB, { cronJobId: id });
}

/** Caller must have already resolved cronJobId through getOrgScopedCronJob - exposed via the router's own call, listRuns just needs the id to already be proven to belong to the caller's org. */
export async function listCronJobRuns(organizationId: string, cronJobId: string) {
  await getOrgScopedCronJob(organizationId, cronJobId);
  return db.query.serviceCronJobRuns.findMany({
    where: eq(serviceCronJobRuns.cronJobId, cronJobId),
    orderBy: [desc(serviceCronJobRuns.startedAt)],
    limit: 50,
  });
}
