import { removeDomainConfig } from "@openploy/traefik";
import type { RemoveDomainConfigJob } from "@openploy/shared";

function getDynamicConfigDir(): string {
  return process.env.TRAEFIK_DYNAMIC_CONFIG_DIR ?? "/etc/traefik/dynamic";
}

/**
 * The domains row is already gone by the time this runs (web deletes it
 * before enqueueing) - this just clears the now-orphaned Traefik route file
 * so a removed domain actually stops serving traffic.
 */
export async function processRemoveDomainConfigJob(job: RemoveDomainConfigJob): Promise<void> {
  await removeDomainConfig(getDynamicConfigDir(), job.domainId);
}
