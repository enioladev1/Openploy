import { pruneBuildCache, pruneStoppedContainers, pruneUnusedImages } from "@openploy/docker";
import type { PruneDockerResourcesJob } from "@openploy/shared";
import { processCheckDiskUsageJob } from "./check-disk-usage";

/**
 * Each target is one of Docker's own prune calls, which are safe by
 * construction: pruneContainers never touches a running container, and
 * pruneImages/pruneBuildCache never touch anything a container still
 * references. Volumes are deliberately not a target here - see
 * check-disk-usage.ts's note on why Docker's own "unused" notion isn't
 * enough for those; they go through remove-orphaned-volume.ts instead, one
 * at a time, cross-referenced against the platform's own records.
 */
export async function processPruneDockerResourcesJob(job: PruneDockerResourcesJob): Promise<void> {
  if (job.target === "containers") {
    await pruneStoppedContainers();
  } else if (job.target === "images") {
    await pruneUnusedImages({ all: job.allImages });
  } else {
    await pruneBuildCache();
  }

  // So the next snapshot the UI reads already reflects what was just reclaimed.
  await processCheckDiskUsageJob();
}
