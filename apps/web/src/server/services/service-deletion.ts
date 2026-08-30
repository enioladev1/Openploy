import "server-only";
import { eq } from "drizzle-orm";
import { domains, services } from "@openploy/db";
import { JOB_REMOVE_SERVICE } from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { logAuditEvent } from "../audit";
import { db } from "../db";
import { NotFoundError } from "../errors";

// Docker/Swarm naming is deterministic from serviceId (see deploy-application.ts,
// deploy-compose.ts, database-service.ts) - no need to load the type-specific
// detail row just to compute it, and it must still resolve after that row is gone.
function dockerTargetFor(serviceId: string, type: "application" | "database" | "compose"): string {
  if (type === "compose") return `stack-${serviceId}`;
  if (type === "database") return `db-${serviceId}`;
  return `app-${serviceId}`;
}

// Caller MUST resolve serviceId through getOrgScopedService before calling this.
export async function deleteService(
  organizationId: string,
  actorUserId: string,
  serviceId: string,
  deleteVolumes = false,
) {
  const service = await db.query.services.findFirst({ where: eq(services.id, serviceId) });
  if (!service) throw new NotFoundError("Service not found");

  const serviceDomains = await db.query.domains.findMany({ where: eq(domains.serviceId, serviceId) });

  // Cascades to the type-specific detail row, domains, env vars, deployments
  // and deployment logs (see packages/db schema onDelete: "cascade" FKs).
  await db.delete(services).where(eq(services.id, serviceId));

  await logAuditEvent(db, {
    organizationId,
    actorUserId,
    action: "service.deleted",
    targetType: "service",
    targetId: serviceId,
    metadata: { name: service.name, type: service.type },
  });

  // Actual container/stack teardown needs docker.sock, which only the agent
  // has - enqueue it rather than blocking this request on it.
  await enqueueJob(JOB_REMOVE_SERVICE, {
    serviceId,
    serviceType: service.type,
    dockerTarget: dockerTargetFor(serviceId, service.type),
    domainIds: serviceDomains.map((d) => d.id),
    deleteVolumes,
  });

  return service;
}
