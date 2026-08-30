import { removeVolume } from "@openploy/docker";
import { JOB_REMOVE_ORPHANED_VOLUME, type RemoveOrphanedVolumeJob } from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { db } from "../db";
import { processCheckDiskUsageJob } from "./check-disk-usage";

const DATABASE_VOLUME_PATTERN = /^vol-([0-9a-f-]{36})$/i;
const COMPOSE_STACK_VOLUME_PATTERN = /^stack-([0-9a-f-]{36})_/i;

// ~2 minutes of retrying at 10s apart - generous for a Swarm task that's slow
// to actually tear down, without retrying a genuinely stuck volume forever.
const MAX_ATTEMPTS = 12;
const RETRY_DELAY_SECONDS = 10;

/**
 * Re-verifies orphan status itself rather than trusting the job payload's
 * volumeName alone - this is an irreversible data-deleting action, so it
 * re-derives "does the owning service still exist" fresh right before
 * removal instead of relying on whatever snapshot the caller last saw.
 */
export async function processRemoveOrphanedVolumeJob(job: RemoveOrphanedVolumeJob): Promise<void> {
  const match = DATABASE_VOLUME_PATTERN.exec(job.volumeName) ?? COMPOSE_STACK_VOLUME_PATTERN.exec(job.volumeName);
  if (!match) {
    throw new Error(`"${job.volumeName}" does not match a known service-volume naming convention - refusing to remove it`);
  }

  const serviceId = match[1]!;
  const existing = await db.query.services.findFirst({ where: (table, { eq }) => eq(table.id, serviceId) });
  if (existing) {
    throw new Error(`Service ${serviceId} still exists - refusing to remove its volume "${job.volumeName}"`);
  }

  try {
    await removeVolume(job.volumeName);
  } catch (err) {
    if (job.attempt >= MAX_ATTEMPTS) throw err;
    await enqueueJob(
      JOB_REMOVE_ORPHANED_VOLUME,
      { volumeName: job.volumeName, attempt: job.attempt + 1 },
      { startAfterSeconds: RETRY_DELAY_SECONDS },
    );
    return;
  }

  await processCheckDiskUsageJob();
}
