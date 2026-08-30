import { listVolumesWithUsage, removeService, removeStack } from "@openploy/docker";
import { removeDomainConfig } from "@openploy/traefik";
import { JOB_REMOVE_ORPHANED_VOLUME, type RemoveServiceJob } from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { stopRuntimeLogTail } from "../runtime-logs";

function getDynamicConfigDir(): string {
  return process.env.TRAEFIK_DYNAMIC_CONFIG_DIR ?? "/etc/traefik/dynamic";
}

// Same naming conventions as database-service.ts (volumeName: `vol-${serviceId}`)
// and the compose deploy pipeline (stack name `stack-${serviceId}`, whose
// volumes Docker Compose itself prefixes the same way) - applications never
// get a persistent volume at all.
async function findServiceVolumeNames(serviceId: string, type: RemoveServiceJob["serviceType"]): Promise<string[]> {
  if (type === "application") return [];
  if (type === "database") return [`vol-${serviceId}`];

  const prefix = `stack-${serviceId}_`;
  const volumes = await listVolumesWithUsage();
  return volumes.filter((volume) => volume.name.startsWith(prefix)).map((volume) => volume.name);
}

/**
 * Best-effort cleanup, not a deployment - there's no deployments row to fail
 * against, and a target that was never actually deployed (or already torn
 * down) is expected, not an error worth retrying pg-boss over. Each step is
 * independent so one failure doesn't block the others.
 */
export async function processRemoveServiceJob(job: RemoveServiceJob): Promise<void> {
  if (job.dockerTarget) {
    // For application/database, dockerTarget IS the tail's key - stop it
    // before the container goes away, rather than let it error out on its
    // own once the log stream ends. (Compose's dockerTarget is the whole
    // stack's name, not the one inner service the tail is keyed by, and the
    // exposedInnerService needed to reconstruct that key is already gone by
    // this point - runtime-logs.ts's own write-failure handling covers that
    // case instead of this belt-and-suspenders stop.)
    if (job.serviceType !== "compose") stopRuntimeLogTail(job.dockerTarget);

    try {
      if (job.serviceType === "compose") {
        await removeStack(job.dockerTarget, () => {});
      } else {
        await removeService(job.dockerTarget);
      }
    } catch (err) {
      console.error(`[remove-service] failed to remove docker target "${job.dockerTarget}" for service ${job.serviceId}:`, err);
    }
  }

  for (const domainId of job.domainIds) {
    try {
      await removeDomainConfig(getDynamicConfigDir(), domainId);
    } catch (err) {
      console.error(`[remove-service] failed to remove domain config ${domainId} for service ${job.serviceId}:`, err);
    }
  }

  if (job.deleteVolumes) {
    const volumeNames = await findServiceVolumeNames(job.serviceId, job.serviceType);
    // Enqueued, not removed inline: the service/stack removal above only
    // asked Swarm to stop the task, not waited for the container to actually
    // be gone - Docker refuses to remove a volume still attached to one, and
    // that teardown can take longer than is reasonable to block this job on.
    // remove-orphaned-volume.ts's own self-requeuing retry handles that,
    // durably (survives an agent restart, unlike an in-process wait).
    for (const volumeName of volumeNames) {
      await enqueueJob(JOB_REMOVE_ORPHANED_VOLUME, { volumeName, attempt: 1 }, { startAfterSeconds: 5 });
    }
  }
}
