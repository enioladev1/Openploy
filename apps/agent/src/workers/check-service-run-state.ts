import { eq } from "drizzle-orm";
import { services } from "@openploy/db";
import { getServiceRunState } from "@openploy/docker";
import { JOB_CHECK_SERVICE_RUN_STATE, type CheckServiceRunStateJob } from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { db } from "../db";
import { resolveRuntimeStatusChangedAt } from "../service-lifecycle";

// ~10 minutes of polling at 30s apart - generous for a slow first image pull,
// without watching any one service forever.
const MAX_ATTEMPTS = 20;
const RETRY_DELAY_SECONDS = 30;

/**
 * Durable counterpart to the immediate wait in finalizeServiceRunState: that
 * one gives up after a bounded window and leaves runtimeStatus at "pending"
 * rather than block the deploy job indefinitely - this job re-checks with
 * backoff (re-enqueueing itself) so a slow-starting container's eventual
 * "running" state still reaches the database. Reload/Start re-arm this from
 * attempt 1, which is the intended way to re-check after MAX_ATTEMPTS gives up.
 */
export async function processCheckServiceRunStateJob(job: CheckServiceRunStateJob): Promise<void> {
  const state = await getServiceRunState(job.serviceName);

  if (state === "running" || state === "failed") {
    const runtimeStatusChangedAt = await resolveRuntimeStatusChangedAt(job.serviceName, state);
    await db
      .update(services)
      .set({ runtimeStatus: state, runtimeStatusChangedAt })
      .where(eq(services.id, job.serviceId));
    return;
  }

  if (job.attempt >= MAX_ATTEMPTS) return;

  await enqueueJob(
    JOB_CHECK_SERVICE_RUN_STATE,
    { serviceId: job.serviceId, serviceName: job.serviceName, attempt: job.attempt + 1 },
    { startAfterSeconds: RETRY_DELAY_SECONDS },
  );
}
