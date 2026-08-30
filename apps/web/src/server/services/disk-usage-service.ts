import "server-only";
import { desc } from "drizzle-orm";
import { diskUsageSnapshots } from "@openploy/db";
import {
  JOB_CHECK_DISK_USAGE,
  JOB_PRUNE_DOCKER_RESOURCES,
  JOB_REMOVE_ORPHANED_VOLUME,
  type PruneDockerResourcesJob,
} from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { db } from "../db";

export async function getLatestDiskUsageSnapshot() {
  return db.query.diskUsageSnapshots.findFirst({ orderBy: [desc(diskUsageSnapshots.checkedAt)] });
}

export async function requestDiskUsageCheck(): Promise<void> {
  await enqueueJob(JOB_CHECK_DISK_USAGE, {});
}

export async function requestPruneDockerResources(target: PruneDockerResourcesJob["target"], allImages: boolean): Promise<void> {
  await enqueueJob(JOB_PRUNE_DOCKER_RESOURCES, { target, allImages });
}

export async function requestRemoveOrphanedVolume(volumeName: string): Promise<void> {
  await enqueueJob(JOB_REMOVE_ORPHANED_VOLUME, { volumeName });
}
