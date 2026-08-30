import "server-only";
import si from "systeminformation";

export interface SystemStats {
  cpu: { percent: number };
  memory: { usedBytes: number; totalBytes: number };
  disk: { usedBytes: number; totalBytes: number };
}

// /proc/stat and /proc/meminfo aren't PID-namespaced by the kernel, and the
// container's overlay writable layer sits on the host's real disk - so these
// reads are accurate for the actual host even without any special container
// privileges or host mounts, from whichever container calls them.
export async function getSystemStats(): Promise<SystemStats> {
  const [load, mem, fsSize] = await Promise.all([si.currentLoad(), si.mem(), si.fsSize()]);

  const rootFs = fsSize.find((entry) => entry.mount === "/") ?? [...fsSize].sort((a, b) => b.size - a.size)[0];

  return {
    cpu: { percent: Math.round(load.currentLoad) },
    memory: { usedBytes: mem.total - mem.available, totalBytes: mem.total },
    disk: { usedBytes: rootFs?.used ?? 0, totalBytes: rootFs?.size ?? 0 },
  };
}
