import "server-only";
import { changePasswordInputSchema, updateProfileInputSchema } from "@openploy/shared";
import { changePassword, getProfile, updateProfile } from "../../services/profile-service";
import { protectedProcedure, router } from "../trpc";

// protectedProcedure, not ownerProcedure - every member edits their own
// profile. IDOR-safe because userId always comes from ctx.auth, never from
// client input, so there's no id to spoof.
export const profileRouter = router({
  // role comes from ctx.auth (the session), not a DB lookup - added so
  // client components (the sidebar's platform-update dialog) can gate an
  // owner-only action without a second round-trip; the actual enforcement is
  // still ownerProcedure server-side, this only drives what's shown.
  get: protectedProcedure.query(async ({ ctx }) => ({ ...(await getProfile(ctx.auth.userId)), role: ctx.auth.role })),

  update: protectedProcedure
    .input(updateProfileInputSchema)
    .mutation(({ ctx, input }) => updateProfile(ctx.auth.organizationId, ctx.auth.userId, input)),

  changePassword: protectedProcedure
    .input(changePasswordInputSchema)
    .mutation(async ({ ctx, input }) => {
      await changePassword(ctx.auth.organizationId, ctx.auth.userId, ctx.auth.sessionId, input);
      return { success: true };
    }),
});
