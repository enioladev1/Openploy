import { eq } from "drizzle-orm";
import { services } from "@openploy/db";
import { scaleService } from "@openploy/docker";
import type { StartServiceJob } from "@openploy/shared";
import { db } from "../db";
import { buildRedactor } from "../redact";
import { finalizeServiceRunState, resolveRuntimeStatusChangedAt } from "../service-lifecycle";
import { getKnownSecretValues } from "../service-secrets";
import { resolveServiceTargets } from "../service-targets";

/** Scales every Swarm service backing this platform service back to 1 - the counterpart to stop-service.ts. Web only allows this from a "stopped" service. */
export async function processStartServiceJob(job: StartServiceJob): Promise<void> {
  const targets = await resolveServiceTargets(job.serviceId);
  if (targets.kind === "none") return;

  const names = targets.kind === "single" ? [targets.name] : targets.names;
  await Promise.all(names.map((name) => scaleService(name, 1)));

  const primary = targets.kind === "single" ? targets.name : targets.primary;
  const service = await db.query.services.findFirst({ where: eq(services.id, job.serviceId) });

  if (!primary || !service?.currentDeploymentId) {
    if (service) {
      await db
        .update(services)
        .set({ runtimeStatus: "pending", runtimeStatusChangedAt: new Date() })
        .where(eq(services.id, job.serviceId));
    }
    return;
  }

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
