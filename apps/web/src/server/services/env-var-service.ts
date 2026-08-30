import "server-only";
import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { databaseServices, environmentVariables, getOrgScopedService, getServiceScopedEnvVar, services } from "@openploy/db";
import { decryptSecret, encryptSecret } from "@openploy/crypto";
import type { BulkSetEnvVarsInput, SetEnvVarInput } from "@openploy/shared";
import { logAuditEvent } from "../audit";
import { db } from "../db";
import { ForbiddenError, NotFoundError } from "../errors";

// Callers MUST resolve serviceId through getOrgScopedService before calling these.

/**
 * A reference target must be a database service in the same project as the
 * pointing service - same-project keeps the graph's edges meaningful, and
 * only databases expose structured connection info (host/port/credentials)
 * to point at in the first place.
 */
async function requireLinkableDatabaseService(organizationId: string, serviceId: string, referencesServiceId: string) {
  const [pointingService, targetService] = await Promise.all([
    getOrgScopedService(db, organizationId, serviceId),
    getOrgScopedService(db, organizationId, referencesServiceId),
  ]);
  if (!pointingService) throw new NotFoundError("Service not found");
  if (!targetService || targetService.type !== "database") {
    throw new NotFoundError("Referenced database service not found");
  }
  if (targetService.projectId !== pointingService.projectId) {
    throw new ForbiddenError("Can only link to a database service in the same project");
  }
}

/**
 * Database services in the same project as serviceId, for the "link to
 * another service" picker - includes engine so the dialog can filter the
 * field dropdown to only what that engine actually exposes (e.g. redis has
 * no username).
 */
export async function listLinkableServices(organizationId: string, serviceId: string) {
  const pointingService = await getOrgScopedService(db, organizationId, serviceId);
  if (!pointingService) throw new NotFoundError("Service not found");

  const rows = await db
    .select({ id: services.id, name: services.name, engine: databaseServices.engine })
    .from(services)
    .innerJoin(databaseServices, eq(databaseServices.serviceId, services.id))
    .where(and(eq(services.projectId, pointingService.projectId), eq(services.type, "database"), ne(services.id, serviceId)))
    .orderBy(services.name);

  return rows;
}

export async function setEnvVar(organizationId: string, actorUserId: string, input: SetEnvVarInput) {
  const existing = await db.query.environmentVariables.findFirst({
    where: and(eq(environmentVariables.serviceId, input.serviceId), eq(environmentVariables.key, input.key)),
  });

  const values =
    input.kind === "reference"
      ? await (async () => {
          await requireLinkableDatabaseService(organizationId, input.serviceId, input.referencesServiceId);
          return {
            valueEncrypted: null,
            isSecret: true,
            scope: input.scope,
            referencesServiceId: input.referencesServiceId,
            referencesField: input.referencesField,
          };
        })()
      : {
          valueEncrypted: JSON.stringify(encryptSecret(input.value)),
          isSecret: input.isSecret,
          scope: input.scope,
          referencesServiceId: null,
          referencesField: null,
        };

  const row = existing
    ? (
        await db
          .update(environmentVariables)
          .set(values)
          .where(eq(environmentVariables.id, existing.id))
          .returning()
      )[0]
    : (
        await db
          .insert(environmentVariables)
          .values({ serviceId: input.serviceId, key: input.key, ...values })
          .returning()
      )[0];

  await logAuditEvent(db, {
    organizationId,
    actorUserId,
    action: existing ? "env.update" : "env.create",
    targetType: "environment_variable",
    targetId: row?.id,
    metadata:
      input.kind === "reference"
        ? { serviceId: input.serviceId, key: input.key, referencesServiceId: input.referencesServiceId, referencesField: input.referencesField }
        : { serviceId: input.serviceId, key: input.key },
  });

  return row;
}

/**
 * Whole-textarea editor semantics: entries is the complete, authoritative set
 * for (serviceId, scope) - anything currently stored under that scope but
 * absent from entries gets deleted, matching "this box is my env file."
 * Bulk-pasted values default to isSecret=true, same as the single-add form.
 */
export async function setEnvVarsBulk(organizationId: string, actorUserId: string, input: BulkSetEnvVarsInput) {
  // Reference rows aren't represented in this textarea at all (they have no
  // storable value to show) - excluded from the existing-rows scan so a save
  // never treats one as "missing from entries" and deletes it.
  const existingRows = await db.query.environmentVariables.findMany({
    where: and(
      eq(environmentVariables.serviceId, input.serviceId),
      eq(environmentVariables.scope, input.scope),
      isNull(environmentVariables.referencesServiceId),
    ),
  });
  const existingByKey = new Map(existingRows.map((row) => [row.key, row]));
  const nextKeys = new Set(input.entries.map((entry) => entry.key));

  const linkedRows = await db.query.environmentVariables.findMany({
    where: and(
      eq(environmentVariables.serviceId, input.serviceId),
      eq(environmentVariables.scope, input.scope),
      isNotNull(environmentVariables.referencesServiceId),
    ),
  });
  const linkedKeys = new Set(linkedRows.map((row) => row.key));
  const collidingKey = input.entries.find((entry) => linkedKeys.has(entry.key));
  if (collidingKey) {
    throw new ForbiddenError(`"${collidingKey.key}" is linked to another service - remove the link before setting it here`);
  }

  const keysToDelete = existingRows.filter((row) => !nextKeys.has(row.key)).map((row) => row.id);

  await db.transaction(async (tx) => {
    if (keysToDelete.length > 0) {
      await tx.delete(environmentVariables).where(inArray(environmentVariables.id, keysToDelete));
    }

    for (const entry of input.entries) {
      const valueEncrypted = JSON.stringify(encryptSecret(entry.value));
      const existing = existingByKey.get(entry.key);
      if (existing) {
        await tx
          .update(environmentVariables)
          .set({ valueEncrypted })
          .where(eq(environmentVariables.id, existing.id));
      } else {
        await tx.insert(environmentVariables).values({
          serviceId: input.serviceId,
          key: entry.key,
          valueEncrypted,
          isSecret: true,
          scope: input.scope,
        });
      }
    }

    await logAuditEvent(tx, {
      organizationId,
      actorUserId,
      action: "env.bulk_update",
      targetType: "service",
      targetId: input.serviceId,
      metadata: {
        scope: input.scope,
        upserted: input.entries.map((entry) => entry.key),
        deleted: existingRows.filter((row) => !nextKeys.has(row.key)).map((row) => row.key),
      },
    });
  });
}

/** Reveals every value for (serviceId, scope) at once, for the bulk editor's "reveal all" toggle. */
export async function revealEnvVarsByScope(
  organizationId: string,
  actorUserId: string,
  serviceId: string,
  scope: "build" | "runtime",
) {
  // Only plain rows - a reference row has no stored value to reveal, and
  // isn't part of the textarea this powers in the first place.
  const rows = await db.query.environmentVariables.findMany({
    where: and(
      eq(environmentVariables.serviceId, serviceId),
      eq(environmentVariables.scope, scope),
      isNull(environmentVariables.referencesServiceId),
    ),
  });

  await logAuditEvent(db, {
    organizationId,
    actorUserId,
    action: "env.reveal_all",
    targetType: "service",
    targetId: serviceId,
    metadata: { scope, keys: rows.map((row) => row.key) },
  });

  return rows.map((row) => ({ key: row.key, value: decryptSecret(JSON.parse(row.valueEncrypted!)) }));
}

export async function listEnvVars(serviceId: string) {
  const rows = await db.query.environmentVariables.findMany({ where: eq(environmentVariables.serviceId, serviceId) });
  const referencedServiceIds = [...new Set(rows.map((row) => row.referencesServiceId).filter((id): id is string => id !== null))];
  const referencedServices =
    referencedServiceIds.length > 0
      ? await db.query.services.findMany({ where: inArray(services.id, referencedServiceIds) })
      : [];
  const nameById = new Map(referencedServices.map((s) => [s.id, s.name]));

  // Values are never sent to the browser in plaintext by default - masked unless explicitly revealed.
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    isSecret: row.isSecret,
    scope: row.scope,
    referencesServiceId: row.referencesServiceId,
    referencesServiceName: row.referencesServiceId ? (nameById.get(row.referencesServiceId) ?? "Unknown service") : null,
    referencesField: row.referencesField,
  }));
}

export async function revealEnvVar(organizationId: string, actorUserId: string, serviceId: string, envVarId: string) {
  const row = await getServiceScopedEnvVar(db, serviceId, envVarId);
  if (!row) throw new NotFoundError("Environment variable not found");
  if (row.referencesServiceId) {
    throw new ForbiddenError("This variable is linked to another service and has no stored value to reveal");
  }

  await logAuditEvent(db, {
    organizationId,
    actorUserId,
    action: "env.reveal",
    targetType: "environment_variable",
    targetId: row.id,
    metadata: { serviceId, key: row.key },
  });

  return decryptSecret(JSON.parse(row.valueEncrypted!));
}

export async function deleteEnvVar(organizationId: string, actorUserId: string, serviceId: string, envVarId: string) {
  const row = await getServiceScopedEnvVar(db, serviceId, envVarId);
  if (!row) throw new NotFoundError("Environment variable not found");

  await db.delete(environmentVariables).where(eq(environmentVariables.id, envVarId));

  await logAuditEvent(db, {
    organizationId,
    actorUserId,
    action: "env.delete",
    targetType: "environment_variable",
    targetId: envVarId,
    metadata: { serviceId, key: row.key },
  });
}
