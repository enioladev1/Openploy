import { eq } from "drizzle-orm";
import { services } from "@openploy/db";
import { scaleService } from "@openploy/docker";
import type { StopServiceJob } from "@openploy/shared";
import { db } from "../db";
import { stopRuntimeLogTail } from "../runtime-logs";
import { resolveServiceTargets } from "../service-targets";

/** Scales every Swarm service backing this platform service to 0 - config and volumes stay intact, just no running task, so nothing is reachable. */
export async function processStopServiceJob(job: StopServiceJob): Promise<void> {
  const targets = await resolveServiceTargets(job.serviceId);
  if (targets.kind === "none") return;

  const names = targets.kind === "single" ? [targets.name] : targets.names;
  await Promise.all(names.map((name) => scaleService(name, 0)));

  const primary = targets.kind === "single" ? targets.name : targets.primary;
  if (primary) stopRuntimeLogTail(primary);

  await db
    .update(services)
    .set({ runtimeStatus: "stopped", runtimeStatusChangedAt: new Date() })
    .where(eq(services.id, job.serviceId));
}
