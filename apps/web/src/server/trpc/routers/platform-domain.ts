import "server-only";
import { setPlatformDomainInputSchema, updateAcmeEmailInputSchema } from "@openploy/shared";
import {
  getAcmeEmail,
  getPlatformDomain,
  recheckPlatformDomainCertificate,
  removePlatformDomain,
  setPlatformDomain,
  updateAcmeEmail,
} from "../../services/platform-domain-service";
import { ownerProcedure, router } from "../trpc";

// Owner-gated: this is an installation-wide setting (which domain reaches
// the dashboard itself), not a per-org resource - same rationale as
// backupsRouter/diskUsageRouter, not an IDOR-style per-row check.
export const platformDomainRouter = router({
  get: ownerProcedure.query(() => getPlatformDomain()),

  set: ownerProcedure
    .input(setPlatformDomainInputSchema)
    .mutation(({ ctx, input }) => setPlatformDomain(ctx.auth.organizationId, ctx.auth.userId, input)),

  remove: ownerProcedure.mutation(async ({ ctx }) => {
    await removePlatformDomain(ctx.auth.organizationId, ctx.auth.userId);
    return { success: true };
  }),

  recheckCertificate: ownerProcedure.mutation(async () => {
    await recheckPlatformDomainCertificate();
    return { success: true };
  }),

  getAcmeEmail: ownerProcedure.query(async () => ({ email: await getAcmeEmail() })),

  updateAcmeEmail: ownerProcedure
    .input(updateAcmeEmailInputSchema)
    .mutation(({ ctx, input }) => updateAcmeEmail(ctx.auth.organizationId, ctx.auth.userId, input)),
});
