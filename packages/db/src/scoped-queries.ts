import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "./client";
import { deployments, domains, environmentVariables, projects, services } from "./schema/index";

/**
 * Every lookup here filters by organizationId/projectId in the WHERE clause
 * itself, not "fetch by id then check the result afterward" - the latter is
 * the classic IDOR bug pattern where the check is easy to forget on a new
 * code path. tRPC procedures must load resources through these helpers, never
 * via a bare `db.query.services.findFirst({ where: eq(services.id, ...) })`.
 */

export async function getOrgScopedProject(db: Database, organizationId: string, projectId: string) {
  return db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)),
  });
}

export async function getProjectScopedService(db: Database, projectId: string, serviceId: string) {
  return db.query.services.findFirst({
    where: and(eq(services.id, serviceId), eq(services.projectId, projectId)),
  });
}

/** Resolves a service by id while proving it belongs to the caller's org, in one query. */
export async function getOrgScopedService(db: Database, organizationId: string, serviceId: string) {
  const rows = await db
    .select({ service: services })
    .from(services)
    .innerJoin(projects, eq(projects.id, services.projectId))
    .where(and(eq(services.id, serviceId), eq(projects.organizationId, organizationId)))
    .limit(1);
  return rows[0]?.service;
}

/**
 * Bulk-action counterpart to getOrgScopedService: returns only the subset of
 * serviceIds that actually belong to this org, so a bulk mutation can act on
 * exactly the legitimate ones and silently drop anything foreign rather than
 * either trusting the client's list outright or failing the whole batch over
 * a single bad/foreign id.
 */
export async function getOrgScopedServices(db: Database, organizationId: string, serviceIds: string[]) {
  if (serviceIds.length === 0) return [];
  const rows = await db
    .select({ service: services })
    .from(services)
    .innerJoin(projects, eq(projects.id, services.projectId))
    .where(and(inArray(services.id, serviceIds), eq(projects.organizationId, organizationId)));
  return rows.map((row) => row.service);
}

export async function getServiceScopedDeployment(db: Database, serviceId: string, deploymentId: string) {
  return db.query.deployments.findFirst({
    where: and(eq(deployments.id, deploymentId), eq(deployments.serviceId, serviceId)),
  });
}

export async function getServiceScopedEnvVar(db: Database, serviceId: string, envVarId: string) {
  return db.query.environmentVariables.findFirst({
    where: and(eq(environmentVariables.id, envVarId), eq(environmentVariables.serviceId, serviceId)),
  });
}

export async function getServiceScopedDomain(db: Database, serviceId: string, domainId: string) {
  return db.query.domains.findFirst({
    where: and(eq(domains.id, domainId), eq(domains.serviceId, serviceId)),
  });
}

/**
 * Not an IDOR check (no caller org to validate against) - this is the
 * agent's own resolution of who owns a service and what to call it, used to
 * fill in notification context (organizationId to fan out to, project/service
 * names to show in the message) from a serviceId a deploy/backup job already trusts.
 */
export async function getServiceNotificationContext(db: Database, serviceId: string) {
  const rows = await db
    .select({
      organizationId: projects.organizationId,
      projectId: projects.id,
      projectName: projects.name,
      serviceName: services.name,
    })
    .from(services)
    .innerJoin(projects, eq(projects.id, services.projectId))
    .where(eq(services.id, serviceId))
    .limit(1);
  return rows[0];
}
