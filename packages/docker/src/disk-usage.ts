import { getDockerClient } from "./client";

// Docker's own /system/df response shape (dockerode's own .df() types this as
// `any`) - only the fields this module actually reads are declared.
interface RawDiskUsage {
  Images: Array<{ Size?: number; Containers?: number }>;
  Containers: Array<{ SizeRootFs?: number; State?: string }>;
  Volumes: Array<{ Name: string; UsageData?: { Size?: number; RefCount?: number } | null }>;
  BuildCache: Array<{ Size?: number; InUse?: boolean }>;
}

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

/**
 * Mirrors what `docker system df` itself computes from the same raw listing -
 * Docker doesn't return these aggregates directly, only the per-object arrays.
 */
export async function getDiskUsage(): Promise<DiskUsageSummary> {
  const docker = getDockerClient();
  const raw = (await docker.df()) as RawDiskUsage;

  const images = raw.Images ?? [];
  const containers = raw.Containers ?? [];
  const volumes = raw.Volumes ?? [];
  const buildCache = raw.BuildCache ?? [];

  const imageActive = images.filter((image) => (image.Containers ?? 0) > 0);
  const containerActive = containers.filter((container) => container.State === "running");
  const volumeActive = volumes.filter((volume) => (volume.UsageData?.RefCount ?? 0) > 0);
  const buildCacheActive = buildCache.filter((entry) => entry.InUse);

  const sum = (items: Array<{ size: number }>) => items.reduce((total, item) => total + item.size, 0);

  return {
    images: {
      totalCount: images.length,
      activeCount: imageActive.length,
      totalBytes: sum(images.map((i) => ({ size: i.Size ?? 0 }))),
      reclaimableBytes: sum(images.filter((i) => (i.Containers ?? 0) === 0).map((i) => ({ size: i.Size ?? 0 }))),
    },
    containers: {
      totalCount: containers.length,
      activeCount: containerActive.length,
      totalBytes: sum(containers.map((c) => ({ size: c.SizeRootFs ?? 0 }))),
      reclaimableBytes: sum(
        containers.filter((c) => c.State !== "running").map((c) => ({ size: c.SizeRootFs ?? 0 })),
      ),
    },
    volumes: {
      totalCount: volumes.length,
      activeCount: volumeActive.length,
      totalBytes: sum(volumes.map((v) => ({ size: v.UsageData?.Size ?? 0 }))),
      reclaimableBytes: sum(
        volumes.filter((v) => (v.UsageData?.RefCount ?? 0) === 0).map((v) => ({ size: v.UsageData?.Size ?? 0 })),
      ),
    },
    buildCache: {
      totalCount: buildCache.length,
      activeCount: buildCacheActive.length,
      totalBytes: sum(buildCache.map((b) => ({ size: b.Size ?? 0 }))),
      reclaimableBytes: sum(buildCache.filter((b) => !b.InUse).map((b) => ({ size: b.Size ?? 0 }))),
    },
  };
}

export interface PruneResult {
  reclaimedBytes: number;
  count: number;
}

/** Only ever removes containers already in "exited"/"created" state - Docker itself never lets this touch a running container. */
export async function pruneStoppedContainers(): Promise<PruneResult> {
  const docker = getDockerClient();
  const result = await docker.pruneContainers();
  return { reclaimedBytes: result.SpaceReclaimed ?? 0, count: result.ContainersDeleted?.length ?? 0 };
}

/**
 * `all` widens from "dangling only" (untagged, orphaned layers) to every
 * image not referenced by any container - including old, no-longer-running
 * deployment image tags (each deploy tags a new image; the previous one only
 * survives as long as something still references it).
 */
export async function pruneUnusedImages(options: { all?: boolean } = {}): Promise<PruneResult> {
  const docker = getDockerClient();
  const result = await docker.pruneImages(options.all ? { filters: { dangling: ["false"] } } : {});
  return { reclaimedBytes: result.SpaceReclaimed ?? 0, count: result.ImagesDeleted?.length ?? 0 };
}

/**
 * Cached build layers only - never touches a running container or a tagged image.
 *
 * Bypasses dockerode's own `pruneBuilder()` wrapper: unlike every other prune
 * method it has, that one builds its request without forwarding any options
 * into the query string, so passing `all: true` through it is silently
 * dropped and only non-shared cache ever gets removed - a small fraction of
 * what getDiskUsage() reports as reclaimable. Dialing the same
 * `/build/prune?` endpoint directly (mirroring how dockerode's own
 * pruneImages does it correctly) is the only way to actually request it.
 */
export async function pruneBuildCache(): Promise<{ reclaimedBytes: number }> {
  const docker = getDockerClient();
  const result = await new Promise<{ SpaceReclaimed?: number }>((resolve, reject) => {
    docker.modem.dial(
      {
        path: "/build/prune?",
        method: "POST",
        options: { all: true },
        statusCodes: { 200: true, 500: "server error" },
      },
      (err, data) => (err ? reject(err) : resolve(data as { SpaceReclaimed?: number })),
    );
  });
  return { reclaimedBytes: result.SpaceReclaimed ?? 0 };
}

export interface DockerVolumeInfo {
  name: string;
  sizeBytes: number;
  refCount: number;
}

/**
 * Raw listing only - deliberately does NOT decide what's "safe to remove".
 * A Swarm service scaled to 0 (this platform's own "Stop" action) has zero
 * containers referencing its volume, which would make Docker's own
 * container-reference-based unused check wrongly call it orphaned - the
 * caller must cross-reference against the platform's own service records
 * instead (see apps/agent's check-disk-usage worker), never Docker's notion
 * of "in use" alone.
 */
export async function listVolumesWithUsage(): Promise<DockerVolumeInfo[]> {
  const docker = getDockerClient();
  const raw = (await docker.df()) as RawDiskUsage;
  return (raw.Volumes ?? []).map((volume) => ({
    name: volume.Name,
    sizeBytes: volume.UsageData?.Size ?? 0,
    refCount: volume.UsageData?.RefCount ?? 0,
  }));
}

/** Caller must already have verified this volume's owning service no longer exists - see the safety note on listVolumesWithUsage. */
export async function removeVolume(name: string): Promise<void> {
  const docker = getDockerClient();
  await docker.getVolume(name).remove();
}
