import { eq } from "drizzle-orm";
import { composeServices, databaseServices, services } from "@openploy/db";
import { listServicesInStack } from "@openploy/docker";
import { db } from "./db";

export type ServiceTargets =
  | { kind: "single"; name: string }
  | { kind: "stack"; names: string[]; primary: string | null }
  | { kind: "none" };

/**
 * Same target-naming convention as the deploy workers (app-<id>, db's own
 * internalHost, stack-<id>_<name> per inner service) - resolved fresh here so
 * lifecycle actions (reload/stop/start) work independently of any deploy.
 * A compose stack can have several services; `primary` is the exposed one
 * (if any), the only one meaningful for the platform's single runtimeStatus
 * badge - the others (a database, a cache) don't get their own status.
 */
export async function resolveServiceTargets(serviceId: string): Promise<ServiceTargets> {
  const service = await db.query.services.findFirst({ where: eq(services.id, serviceId) });
  if (!service) return { kind: "none" };

  if (service.type === "application") {
    return { kind: "single", name: `app-${serviceId}` };
  }

  if (service.type === "database") {
    const dbService = await db.query.databaseServices.findFirst({ where: eq(databaseServices.serviceId, serviceId) });
    if (!dbService) return { kind: "none" };
    return { kind: "single", name: dbService.internalHost };
  }

  // compose
  const stackName = `stack-${serviceId}`;
  const names = await listServicesInStack(stackName);
  if (names.length === 0) return { kind: "none" };

  const composeService = await db.query.composeServices.findFirst({ where: eq(composeServices.serviceId, serviceId) });
  const primary = composeService?.exposedInnerService ? `${stackName}_${composeService.exposedInnerService}` : null;

  return { kind: "stack", names, primary };
}
