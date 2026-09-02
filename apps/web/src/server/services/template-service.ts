import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getOrgScopedProject, services } from "@openploy/db";
import type { DeployTemplateInput } from "@openploy/shared";
import { db } from "../db";
import { NotFoundError } from "../errors";
import { createComposeServiceShell, setComposeSource, setExposedInnerService } from "./compose-service";
import { generateNipIoDomain } from "./domain-service";
import { setEnvVarsBulk } from "./env-var-service";
import { getTemplateDefinition, type TemplateEnvValue } from "./templates";

function resolveEnvValue(value: TemplateEnvValue, domainHost: string): string {
  switch (value.type) {
    case "fixed":
      return value.value;
    case "empty":
      return "";
    case "domainHost":
      return domainHost;
    case "generatedSecret":
      return randomBytes(value.bytes).toString("hex");
  }
}

/** Appends -2, -3, ... only if the plain template id is already taken in this project - most projects deploy a template once. */
async function uniqueServiceName(projectId: string, base: string): Promise<string> {
  const existing = await db.query.services.findMany({
    where: eq(services.projectId, projectId),
    columns: { name: true },
  });
  const taken = new Set(existing.map((row) => row.name));
  if (!taken.has(base)) return base;
  let attempt = 2;
  while (taken.has(`${base}-${attempt}`)) attempt += 1;
  return `${base}-${attempt}`;
}

/**
 * One-click template deploy - creates and fully configures a compose service
 * (source, env vars, domain, exposed inner service) but deliberately does
 * NOT trigger a deployment. The user reviews what got filled in (especially
 * templates like phpMyAdmin, which needs its DB connection env vars filled
 * in by hand) and deploys manually when ready, same as any other compose
 * service - see deployments.trigger.
 */
export async function deployTemplate(organizationId: string, userId: string, input: DeployTemplateInput) {
  const project = await getOrgScopedProject(db, organizationId, input.projectId);
  if (!project) throw new NotFoundError("Project not found");

  const template = getTemplateDefinition(input.templateId);
  const name = await uniqueServiceName(input.projectId, template.id);

  const service = await createComposeServiceShell(organizationId, userId, { projectId: input.projectId, name }, template.id);

  // Domain first - some templates (n8n) need the generated host as one of
  // their own env var values.
  const domain = await generateNipIoDomain({
    serviceId: service.id,
    targetPort: template.exposedPort,
    enableTls: true,
  });
  if (!domain) throw new Error("Failed to generate a domain for this template");

  if (template.envVars.length > 0) {
    const entries = template.envVars.map((envVar) => ({
      key: envVar.key,
      value: resolveEnvValue(envVar.value, domain.host),
    }));
    await setEnvVarsBulk(organizationId, userId, { serviceId: service.id, scope: "runtime", entries });
  }

  await setComposeSource(organizationId, {
    serviceId: service.id,
    sourceType: "raw",
    rawComposeContent: template.composeYaml,
  });
  await setExposedInnerService(service.id, template.exposedInnerService);

  return service;
}
