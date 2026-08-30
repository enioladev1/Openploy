import { ne } from "drizzle-orm";
import { diskUsageSnapshots, type OrphanedVolume } from "@openploy/db";
import { getDiskUsage, listVolumesWithUsage } from "@openploy/docker";
import { db } from "../db";

const DATABASE_VOLUME_PATTERN = /^vol-([0-9a-f-]{36})$/i;
const COMPOSE_STACK_VOLUME_PATTERN = /^stack-([0-9a-f-]{36})_/i;

/**
 * Only volumes matching this platform's own naming conventions are ever
 * candidates - anything else (the platform's own infra volumes like
 * postgres_data/registry_data/traefik_*, or an unrelated volume on the host)
 * is left alone entirely, never even considered.
 *
 * Critically, this does NOT use Docker's own "unused" notion (UsageData.RefCount
 * === 0): a Swarm service scaled to 0 - this platform's own "Stop" action -
 * has zero containers referencing its volume, which would make Docker's
 * check wrongly call a stopped (not deleted) service's data volume orphaned.
 * Instead, a volume is only orphaned if the service its name encodes no
 * longer exists in the platform's own services table at all.
 */
async function findOrphanedVolumes(): Promise<OrphanedVolume[]> {
  const volumes = await listVolumesWithUsage();
  const candidates = volumes
    .map((volume) => {
      const match = DATABASE_VOLUME_PATTERN.exec(volume.name) ?? COMPOSE_STACK_VOLUME_PATTERN.exec(volume.name);
      return match ? { volume, serviceId: match[1]! } : null;
    })
    .filter((entry): entry is { volume: (typeof volumes)[number]; serviceId: string } => entry !== null);

  if (candidates.length === 0) return [];

  const existingServices = await db.query.services.findMany({
    where: (table, { inArray }) => inArray(table.id, candidates.map((c) => c.serviceId)),
    columns: { id: true },
  });
  const existingIds = new Set(existingServices.map((s) => s.id));

  return candidates
    .filter((entry) => !existingIds.has(entry.serviceId))
    .map((entry) => ({ name: entry.volume.name, sizeBytes: entry.volume.sizeBytes, formerServiceId: entry.serviceId }));
}

/** Always exactly one row afterward - see the schema's note on why this is a snapshot, not a history. */
export async function processCheckDiskUsageJob(): Promise<void> {
  const [summary, orphanedVolumes] = await Promise.all([getDiskUsage(), findOrphanedVolumes()]);

  const [inserted] = await db
    .insert(diskUsageSnapshots)
    .values({ summary, orphanedVolumes })
    .returning({ id: diskUsageSnapshots.id });
  if (inserted) {
    await db.delete(diskUsageSnapshots).where(ne(diskUsageSnapshots.id, inserted.id));
  }
}
