import "server-only";
import { z } from "zod";
import {
  getLatestDiskUsageSnapshot,
  requestDiskUsageCheck,
  requestPruneDockerResources,
  requestRemoveOrphanedVolume,
} from "../../services/disk-usage-service";
import { ownerProcedure, router } from "../trpc";

// Owner-gated throughout: this is a host-level resource (Docker itself, not
// anything org-scoped), so the risk here is "which member can trigger a
// destructive host action," not an IDOR-style per-row check - see ownerProcedure.
export const diskUsageRouter = router({
  getSnapshot: ownerProcedure.query(() => getLatestDiskUsageSnapshot()),

  check: ownerProcedure.mutation(async () => {
    await requestDiskUsageCheck();
    return { success: true };
  }),

  pruneContainers: ownerProcedure.mutation(async () => {
    await requestPruneDockerResources("containers", false);
    return { success: true };
  }),

  pruneImages: ownerProcedure
    .input(z.object({ all: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      await requestPruneDockerResources("images", input.all);
      return { success: true };
    }),

  pruneBuildCache: ownerProcedure.mutation(async () => {
    await requestPruneDockerResources("buildCache", false);
    return { success: true };
  }),

  removeOrphanedVolume: ownerProcedure
    .input(z.object({ volumeName: z.string().min(1).max(200) }))
    .mutation(async ({ input }) => {
      await requestRemoveOrphanedVolume(input.volumeName);
      return { success: true };
    }),
});
