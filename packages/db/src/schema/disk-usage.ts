import { jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";
import { id } from "../columns";

export interface DiskUsageCategory {
  totalCount: number;
  activeCount: number;
  totalBytes: number;
  reclaimableBytes: number;
}

export interface DiskUsageSummary {
  images: DiskUsageCategory;
  containers: DiskUsageCategory;
  volumes: DiskUsageCategory;
  buildCache: DiskUsageCategory;
}

export interface OrphanedVolume {
  name: string;
  sizeBytes: number;
  /** The service this volume's name implies once existed - null when the name doesn't match a known naming convention. */
  formerServiceId: string | null;
}

/**
 * Always exactly one row - the agent deletes every older row right after
 * inserting a fresh one (see check-disk-usage.ts), so this is a snapshot to
 * read, not a history to query. Docker itself is host-level, not
 * per-organization, but every check/prune action from apps/web is still
 * gated to org owners - see the disk-usage tRPC router.
 */
export const diskUsageSnapshots = pgTable("disk_usage_snapshots", {
  id: id(),
  summary: jsonb("summary").$type<DiskUsageSummary>().notNull(),
  orphanedVolumes: jsonb("orphaned_volumes").$type<OrphanedVolume[]>().notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});
