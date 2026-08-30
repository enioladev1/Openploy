import { eq } from "drizzle-orm";
import { composeServices, services } from "@openploy/db";
import type { SyncDomainsJob } from "@openploy/shared";
import { db } from "../db";
import { syncDomainsForService } from "../traefik-sync";

/**
 * Same target-service-name convention as the deploy workers (app-<id> /
 * stack-<id>_<exposedInnerService>), computed fresh here rather than reused
 * from a deploy - this runs independently of any deploy, whenever a domain
 * is added so it applies without needing a redeploy. Database services have
 * no routing target; a compose service with no exposedInnerService yet has
 * nothing to route to either.
 */
async function resolveTargetServiceName(serviceId: string, type: "application" | "database" | "compose"): Promise<string | null> {
  if (type === "application") return `app-${serviceId}`;
  if (type === "database") return null;

  const composeService = await db.query.composeServices.findFirst({ where: eq(composeServices.serviceId, serviceId) });
  if (!composeService?.exposedInnerService) return null;
  return `stack-${serviceId}_${composeService.exposedInnerService}`;
}

export async function processSyncDomainsJob(job: SyncDomainsJob): Promise<void> {
  const service = await db.query.services.findFirst({ where: eq(services.id, job.serviceId) });
  if (!service) return;

  const targetServiceName = await resolveTargetServiceName(service.id, service.type);
  if (!targetServiceName) return;

  await syncDomainsForService(service.id, targetServiceName);
}
