import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getOrgScopedService } from "@openploy/db";
import { triggerDeploymentInputSchema } from "@openploy/shared";
import { cancelDeployment, getDeployment, listDeployments, triggerManualDeployment } from "../../services/deployment-service";
import { db } from "../../db";
import { protectedProcedure, router, writeProcedure } from "../trpc";

async function requireOrgScopedService(organizationId: string, serviceId: string) {
  const service = await getOrgScopedService(db, organizationId, serviceId);
  if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "Service not found" });
  return service;
}

export const deploymentsRouter = router({
  list: protectedProcedure
    .input(z.object({ serviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return listDeployments(input.serviceId);
    }),

  get: protectedProcedure
    .input(z.object({ serviceId: z.string().uuid(), deploymentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return getDeployment(input.serviceId, input.deploymentId);
    }),

  trigger: writeProcedure.input(triggerDeploymentInputSchema).mutation(async ({ ctx, input }) => {
    await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
    return triggerManualDeployment(input.serviceId, ctx.auth.userId, input.idempotencyKey);
  }),

  cancel: writeProcedure
    .input(z.object({ serviceId: z.string().uuid(), deploymentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return cancelDeployment(input.serviceId, input.deploymentId);
    }),
});
