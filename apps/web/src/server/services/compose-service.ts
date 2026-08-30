import "server-only";
import { eq } from "drizzle-orm";
import { composeServices, getOrgScopedProject, githubInstallations, services } from "@openploy/db";
import type { ComposeSourceInput, CreateServiceShellInput } from "@openploy/shared";
import { db } from "../db";
import { ForbiddenError, NotFoundError } from "../errors";

export async function createComposeServiceShell(
  organizationId: string,
  userId: string,
  input: CreateServiceShellInput,
) {
  const project = await getOrgScopedProject(db, organizationId, input.projectId);
  if (!project) throw new NotFoundError("Project not found");

  return db.transaction(async (tx) => {
    const [service] = await tx
      .insert(services)
      .values({ projectId: input.projectId, name: input.name, type: "compose", createdByUserId: userId })
      .returning();
    if (!service) throw new Error("Failed to create service");

    await tx.insert(composeServices).values({ serviceId: service.id });

    return service;
  });
}

// Caller MUST resolve serviceId through getOrgScopedService before calling this.
export async function setComposeSource(organizationId: string, input: ComposeSourceInput) {
  if (input.sourceType === "repo") {
    const installation = await db.query.githubInstallations.findFirst({
      where: eq(githubInstallations.id, input.githubInstallationId),
    });
    if (!installation || installation.organizationId !== organizationId) {
      throw new ForbiddenError("GitHub installation does not belong to this organization");
    }
  }

  const [row] = await db
    .update(composeServices)
    .set(
      input.sourceType === "repo"
        ? {
            sourceType: "repo",
            githubInstallationId: input.githubInstallationId,
            repoOwner: input.repoOwner,
            repoName: input.repoName,
            branch: input.branch,
            composeFilePath: input.composeFilePath,
            rawComposeContent: null,
          }
        : {
            sourceType: "raw",
            rawComposeContent: input.rawComposeContent,
            githubInstallationId: null,
            repoOwner: null,
            repoName: null,
            branch: null,
            composeFilePath: null,
          },
    )
    .where(eq(composeServices.serviceId, input.serviceId))
    .returning();
  if (!row) throw new NotFoundError("Compose service configuration not found");
  return row;
}

export async function getComposeServiceDetail(serviceId: string) {
  const detail = await db.query.composeServices.findFirst({ where: eq(composeServices.serviceId, serviceId) });
  if (!detail) throw new NotFoundError("Compose service configuration not found");
  return detail;
}

// Caller MUST resolve serviceId through getOrgScopedService before calling this.
// Not set at creation time is a common path (the field is easy to skip on the
// create form), so this needs to be changeable afterward, not a one-shot decision.
export async function setExposedInnerService(serviceId: string, exposedInnerService: string | null) {
  const [row] = await db
    .update(composeServices)
    .set({ exposedInnerService })
    .where(eq(composeServices.serviceId, serviceId))
    .returning();
  if (!row) throw new NotFoundError("Compose service configuration not found");
  return row;
}
