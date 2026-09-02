import "server-only";
import { and, count, desc, eq, getTableColumns, inArray, isNotNull } from "drizzle-orm";
import {
  certificates,
  composeServices,
  databaseServices,
  deployments,
  domains,
  environmentVariables,
  getOrgScopedProject,
  projects,
  services,
} from "@openploy/db";
import type { CreateProjectInput, UpdateProjectInput } from "@openploy/shared";
import { db } from "../db";
import { ForbiddenError, NotFoundError } from "../errors";

export async function createProject(organizationId: string, userId: string, input: CreateProjectInput) {
  const [project] = await db
    .insert(projects)
    .values({
      organizationId,
      name: input.name,
      description: input.description,
      createdByUserId: userId,
    })
    .returning();
  if (!project) throw new Error("Failed to create project");
  return project;
}

/** services is every service in the project, each carrying its engine (for databases) and templateId (for a compose service deployed from the template picker) - enough for the project card to render one icon per actual service, not just its type. */
export async function listProjects(organizationId: string) {
  const projectRows = await db
    .select({ ...getTableColumns(projects), serviceCount: count(services.id) })
    .from(projects)
    .leftJoin(services, eq(services.projectId, projects.id))
    .where(eq(projects.organizationId, organizationId))
    .groupBy(projects.id)
    .orderBy(desc(projects.createdAt));

  if (projectRows.length === 0) return [];

  const serviceRows = await db
    .select({
      projectId: services.projectId,
      id: services.id,
      type: services.type,
      engine: databaseServices.engine,
      templateId: composeServices.templateId,
    })
    .from(services)
    .leftJoin(databaseServices, eq(databaseServices.serviceId, services.id))
    .leftJoin(composeServices, eq(composeServices.serviceId, services.id))
    .where(inArray(services.projectId, projectRows.map((p) => p.id)));

  const servicesByProject = new Map<string, typeof serviceRows>();
  for (const row of serviceRows) {
    const existing = servicesByProject.get(row.projectId) ?? [];
    existing.push(row);
    servicesByProject.set(row.projectId, existing);
  }

  return projectRows.map((project) => ({ ...project, services: servicesByProject.get(project.id) ?? [] }));
}

export async function getProject(organizationId: string, projectId: string) {
  const project = await getOrgScopedProject(db, organizationId, projectId);
  if (!project) throw new NotFoundError("Project not found");
  return project;
}

// Caller MUST have already resolved the project through getProject (org-scoped) before calling this.
export async function listServicesForProject(projectId: string) {
  return db.query.services.findMany({
    where: eq(services.projectId, projectId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });
}

const IN_FLIGHT_DEPLOYMENT_STATUSES = new Set(["queued", "building", "deploying"]);

/**
 * Same as listServicesForProject, plus isDeploying, domains, (for database
 * services) engine, and (for a compose service deployed from the template
 * picker) templateId - everything the project graph card needs beyond the
 * base row, batched per project rather than N+1 per service.
 *
 * isDeploying: runtimeStatus alone can't show an in-progress deploy - it's
 * "unknown" until a service's first deploy ever finishes, and for a redeploy
 * of an already-running service it just stays "running" throughout, so the
 * graph needs the service's latest deployment status too to know a deploy is
 * actually in flight right now.
 *
 * Caller MUST have already resolved the project through getProject.
 */
export async function listServicesForProjectWithDeployStatus(projectId: string) {
  const projectServices = await listServicesForProject(projectId);
  if (projectServices.length === 0) return [];

  const serviceIds = projectServices.map((s) => s.id);

  const [latestDeployments, domainRows, engineRows, templateRows] = await Promise.all([
    db
      .selectDistinctOn([deployments.serviceId], { serviceId: deployments.serviceId, status: deployments.status })
      .from(deployments)
      .where(inArray(deployments.serviceId, serviceIds))
      .orderBy(deployments.serviceId, desc(deployments.createdAt)),
    // certificateStatus, not just certificateId presence - matches
    // domain-service.ts's listDomains, whose "issued only -> https" rule this
    // graph card link must match exactly, since this dev environment (and
    // any without a working ACME setup) never actually issues certificates.
    db
      .select({
        id: domains.id,
        serviceId: domains.serviceId,
        host: domains.host,
        certificateStatus: certificates.status,
      })
      .from(domains)
      .leftJoin(certificates, eq(domains.certificateId, certificates.id))
      .where(inArray(domains.serviceId, serviceIds)),
    db
      .select({ serviceId: databaseServices.serviceId, engine: databaseServices.engine })
      .from(databaseServices)
      .where(inArray(databaseServices.serviceId, serviceIds)),
    db
      .select({ serviceId: composeServices.serviceId, templateId: composeServices.templateId })
      .from(composeServices)
      .where(inArray(composeServices.serviceId, serviceIds)),
  ]);

  const inFlightServiceIds = new Set(
    latestDeployments.filter((d) => IN_FLIGHT_DEPLOYMENT_STATUSES.has(d.status)).map((d) => d.serviceId),
  );
  const domainsByService = new Map<string, { id: string; host: string; isIssued: boolean }[]>();
  for (const row of domainRows) {
    const list = domainsByService.get(row.serviceId) ?? [];
    list.push({ id: row.id, host: row.host, isIssued: row.certificateStatus === "issued" });
    domainsByService.set(row.serviceId, list);
  }
  const engineByService = new Map(engineRows.map((row) => [row.serviceId, row.engine]));
  const templateByService = new Map(templateRows.map((row) => [row.serviceId, row.templateId]));

  return projectServices.map((service) => ({
    ...service,
    isDeploying: inFlightServiceIds.has(service.id),
    domains: domainsByService.get(service.id) ?? [],
    engine: engineByService.get(service.id) ?? null,
    templateId: templateByService.get(service.id) ?? null,
  }));
}

/**
 * Which services in this project have a "linked variable" pointing at which
 * other service - purely structural (which service points at which), never
 * touches a variable's actual value, so this needs no decryption at all.
 * Caller MUST have already resolved the project through getProject.
 */
export async function listServiceLinksForProject(projectId: string): Promise<{ from: string; to: string }[]> {
  const projectServices = await listServicesForProject(projectId);
  const projectServiceIds = projectServices.map((s) => s.id);
  if (projectServiceIds.length === 0) return [];

  const rows = await db
    .selectDistinct({ from: environmentVariables.serviceId, to: environmentVariables.referencesServiceId })
    .from(environmentVariables)
    .where(and(inArray(environmentVariables.serviceId, projectServiceIds), isNotNull(environmentVariables.referencesServiceId)));

  return rows.filter((row): row is { from: string; to: string } => row.to !== null);
}

/**
 * Blocked entirely while any service exists in the project, regardless of its
 * runtime status (stopped/failed still represents real config/volumes a user
 * should consciously remove first) - never a cascading delete-everything action.
 */
export async function deleteProject(organizationId: string, projectId: string): Promise<void> {
  await getProject(organizationId, projectId);

  const projectServices = await listServicesForProject(projectId);
  if (projectServices.length > 0) {
    throw new ForbiddenError(
      `This project has ${projectServices.length} service${projectServices.length === 1 ? "" : "s"} in it. Delete all services before deleting the project.`,
    );
  }

  await db.delete(projects).where(eq(projects.id, projectId));
}

export async function updateProject(organizationId: string, input: UpdateProjectInput) {
  // Load through the scoped helper first: proves the project belongs to this
  // org before the UPDATE, rather than trusting the id in isolation.
  await getProject(organizationId, input.id);

  const [updated] = await db
    .update(projects)
    .set({ name: input.name, description: input.description })
    .where(eq(projects.id, input.id))
    .returning();
  return updated;
}
