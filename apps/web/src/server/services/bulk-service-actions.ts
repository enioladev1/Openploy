import "server-only";
import { getOrgScopedServices } from "@openploy/db";
import { db } from "../db";
import { deleteService } from "./service-deletion";
import { startService, stopService } from "./service-lifecycle";

export interface BulkActionResult {
  serviceId: string;
  success: boolean;
  error?: string;
}

/**
 * Resolves the caller's org-owned subset of serviceIds first (same IDOR
 * guarantee as every single-service action, just batched), then runs the
 * action per service independently - one service failing (e.g. Start on a
 * service that isn't stopped) must not abort the rest of the selection.
 */
async function runBulk(
  organizationId: string,
  serviceIds: string[],
  action: (serviceId: string) => Promise<void>,
): Promise<BulkActionResult[]> {
  const validServices = await getOrgScopedServices(db, organizationId, serviceIds);
  const validIds = new Set(validServices.map((s) => s.id));

  return Promise.all(
    serviceIds.map(async (serviceId): Promise<BulkActionResult> => {
      if (!validIds.has(serviceId)) return { serviceId, success: false, error: "Service not found" };
      try {
        await action(serviceId);
        return { serviceId, success: true };
      } catch (err) {
        return { serviceId, success: false, error: err instanceof Error ? err.message : "Action failed" };
      }
    }),
  );
}

export function bulkDeleteServices(organizationId: string, userId: string, serviceIds: string[], deleteVolumes = false) {
  return runBulk(organizationId, serviceIds, async (id) => {
    await deleteService(organizationId, userId, id, deleteVolumes);
  });
}

export function bulkStopServices(organizationId: string, serviceIds: string[]) {
  return runBulk(organizationId, serviceIds, (id) => stopService(id));
}

export function bulkStartServices(organizationId: string, serviceIds: string[]) {
  return runBulk(organizationId, serviceIds, (id) => startService(id));
}
