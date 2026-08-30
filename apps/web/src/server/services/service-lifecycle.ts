import "server-only";
import { eq } from "drizzle-orm";
import { services } from "@openploy/db";
import { JOB_RELOAD_SERVICE, JOB_START_SERVICE, JOB_STOP_SERVICE } from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { db } from "../db";
import { ForbiddenError, NotFoundError } from "../errors";

// Callers MUST resolve serviceId through getOrgScopedService before calling these.

export async function reloadService(serviceId: string): Promise<void> {
  await enqueueJob(JOB_RELOAD_SERVICE, { serviceId });
}

export async function stopService(serviceId: string): Promise<void> {
  await enqueueJob(JOB_STOP_SERVICE, { serviceId });
}

/** Only valid from "stopped" - which itself only happens after at least one successful deploy, so there's always something to start back up. */
export async function startService(serviceId: string): Promise<void> {
  const service = await db.query.services.findFirst({ where: eq(services.id, serviceId) });
  if (!service) throw new NotFoundError("Service not found");
  if (service.runtimeStatus !== "stopped") {
    throw new ForbiddenError('Service is not stopped - "Start" is only available for a stopped service');
  }

  await enqueueJob(JOB_START_SERVICE, { serviceId });
}
