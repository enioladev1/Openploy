import { eq } from "drizzle-orm";
import { services } from "@openploy/db";
import { restartService } from "@openploy/docker";
import type { ReloadServiceJob } from "@openploy/shared";
import { db } from "../db";
import { buildRedactor } from "../redact";
import { finalizeServiceRunState, resolveRuntimeStatusChangedAt } from "../service-lifecycle";
import { getKnownSecretValues } from "../service-secrets";
import { resolveServiceTargets } from "../service-targets";

/** Restarts every Swarm service backing this platform service in place - same image, same config, no rebuild. */
export async function processReloadServiceJob(job: ReloadServiceJob): Promise<void> {
  const targets = await resolveServiceTargets(job.serviceId);
  if (targets.kind === "none") return;

  const names = targets.kind === "single" ? [targets.name] : targets.names;
  await Promise.all(names.map((name) => restartService(name)));

  const primary = targets.kind === "single" ? targets.name : targets.primary;
  if (!primary) return;

  const service = await db.query.services.findFirst({ where: eq(services.id, job.serviceId) });
  if (!service?.currentDeploymentId) return;

  const secretValues = await getKnownSecretValues(job.serviceId, service.type);
  const finalState = await finalizeServiceRunState(
    primary,
    job.serviceId,
    service.currentDeploymentId,
    buildRedactor(secretValues),
  );
  const runtimeStatusChangedAt = await resolveRuntimeStatusChangedAt(primary, finalState);
  await db
    .update(services)
    .set({ runtimeStatus: finalState, runtimeStatusChangedAt })
    .where(eq(services.id, job.serviceId));
}
