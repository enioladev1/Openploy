import "server-only";
import { eq } from "drizzle-orm";
import { applicationServices, getOrgScopedProject, githubInstallations, services } from "@openploy/db";
import type { ApplicationConfigInput, CreateServiceShellInput } from "@openploy/shared";
import { db } from "../db";
import { ForbiddenError, NotFoundError } from "../errors";

export async function createApplicationServiceShell(
  organizationId: string,
  userId: string,
  input: CreateServiceShellInput,
) {
  const project = await getOrgScopedProject(db, organizationId, input.projectId);
  if (!project) throw new NotFoundError("Project not found");

  return db.transaction(async (tx) => {
    const [service] = await tx
      .insert(services)
      .values({ projectId: input.projectId, name: input.name, type: "application", createdByUserId: userId })
      .returning();
    if (!service) throw new Error("Failed to create service");

    await tx.insert(applicationServices).values({ serviceId: service.id });

    return service;
  });
}

// Caller MUST resolve serviceId through getOrgScopedService before calling this.
export async function setApplicationConfig(organizationId: string, input: ApplicationConfigInput) {
  const installation = await db.query.githubInstallations.findFirst({
    where: eq(githubInstallations.id, input.githubInstallationId),
  });
  if (!installation || installation.organizationId !== organizationId) {
    throw new ForbiddenError("GitHub installation does not belong to this organization");
  }

  const [row] = await db
    .update(applicationServices)
    .set({
      sourceType: "repo",
      githubInstallationId: input.githubInstallationId,
      repoOwner: input.repoOwner,
      repoName: input.repoName,
      branch: input.branch,
      buildMethod: input.buildMethod,
      dockerfileDirectory: input.dockerfileDirectory,
      autoDeployOnPush: input.autoDeployOnPush,
    })
    .where(eq(applicationServices.serviceId, input.serviceId))
    .returning();
  if (!row) throw new NotFoundError("Application service configuration not found");
  return row;
}

export async function getApplicationServiceDetail(serviceId: string) {
  const detail = await db.query.applicationServices.findFirst({
    where: eq(applicationServices.serviceId, serviceId),
  });
  if (!detail) throw new NotFoundError("Application service configuration not found");
  return detail;
}

// Caller MUST resolve serviceId through getOrgScopedService before calling this.
export async function setAutoDeployOnPush(serviceId: string, enabled: boolean) {
  const [row] = await db
    .update(applicationServices)
    .set({ autoDeployOnPush: enabled })
    .where(eq(applicationServices.serviceId, serviceId))
    .returning();
  if (!row) throw new NotFoundError("Application service configuration not found");
  return row;
}
