import "server-only";
import { checkPlatformUpdateNow, getPlatformUpdateStatus, triggerPlatformUpdate } from "../../services/platform-update-service";
import { ownerProcedure, protectedProcedure, router } from "../trpc";

export const platformUpdateRouter = router({
  // Any role - the sidebar indicator is visible to everyone, only triggering
  // an update (or an on-demand check) is owner-gated.
  status: protectedProcedure.query(() => getPlatformUpdateStatus()),

  trigger: ownerProcedure.mutation(async ({ ctx }) => {
    await triggerPlatformUpdate(ctx.auth.organizationId, ctx.auth.userId);
    return { success: true };
  }),

  checkNow: ownerProcedure.mutation(async () => {
    await checkPlatformUpdateNow();
    return { success: true };
  }),
});
