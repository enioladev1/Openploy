import { eq } from "drizzle-orm";
import { composeServices, serviceCronJobRuns, serviceCronJobs, services } from "@openploy/db";
import { execInContainer } from "@openploy/docker";
import type { RunCronJobJob } from "@openploy/shared";
import { db } from "../db";

const OUTPUT_MAX_LENGTH = 8000;

/** Updates the run's own history row and the parent job's lastRun* summary together, so the two can never disagree. */
async function markResult(cronJobId: string, runId: string, status: "success" | "failed", output: string): Promise<void> {
  const truncated = output.slice(0, OUTPUT_MAX_LENGTH);
  const finishedAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(serviceCronJobRuns)
      .set({ status, output: truncated, finishedAt })
      .where(eq(serviceCronJobRuns.id, runId));
    await tx
      .update(serviceCronJobs)
      .set({ lastRunAt: finishedAt, lastRunStatus: status, lastRunOutput: truncated })
      .where(eq(serviceCronJobs.id, cronJobId));
  });
}

/** Deterministic Swarm exec target per service type - matches deploy-application.ts/deploy-compose.ts/service-deletion.ts exactly. */
async function resolveExecTarget(serviceId: string, serviceType: "application" | "database" | "compose"): Promise<string> {
  if (serviceType === "application") return `app-${serviceId}`;
  if (serviceType === "database") return `db-${serviceId}`;

  const compose = await db.query.composeServices.findFirst({ where: eq(composeServices.serviceId, serviceId) });
  if (!compose?.exposedInnerService) {
    throw new Error("This compose service has no exposed inner service configured - set one on the Source tab first");
  }
  return `stack-${serviceId}_${compose.exposedInnerService}`;
}

export async function processRunCronJobJob(job: RunCronJobJob): Promise<void> {
  const cronJob = await db.query.serviceCronJobs.findFirst({ where: eq(serviceCronJobs.id, job.cronJobId) });
  if (!cronJob) return; // deleted since being enqueued - nothing to do

  // command is snapshotted onto the run row now, not read back from the
  // parent job later - so this run's history stays accurate even if the job
  // is edited afterward.
  const [run] = await db
    .insert(serviceCronJobRuns)
    .values({ cronJobId: cronJob.id, command: cronJob.command, status: "running", startedAt: new Date() })
    .returning();
  if (!run) throw new Error("Failed to create cron job run record");

  try {
    const service = await db.query.services.findFirst({ where: eq(services.id, cronJob.serviceId) });
    if (!service) throw new Error("Service no longer exists");

    const target = await resolveExecTarget(service.id, service.type);
    // No pre-check of whether the container is running - execInContainer's
    // own "no running container found" error is already clean enough to
    // store directly as the run's output, same as run-database-backup.ts.
    const output = await execInContainer(target, { cmd: ["sh", "-c", cronJob.command] });

    await markResult(job.cronJobId, run.id, "success", output);
  } catch (err) {
    await markResult(job.cronJobId, run.id, "failed", err instanceof Error ? err.message : String(err));
  }
}
