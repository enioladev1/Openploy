import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getOrgScopedService } from "@openploy/db";
import { bulkSetEnvVarsInputSchema, envVarScopeSchema, setEnvVarInputSchema } from "@openploy/shared";
import {
  deleteEnvVar,
  listEnvVars,
  listLinkableServices,
  revealEnvVar,
  revealEnvVarsByScope,
  setEnvVar,
  setEnvVarsBulk,
} from "../../services/env-var-service";
import { db } from "../../db";
import { protectedProcedure, router, writeProcedure } from "../trpc";

async function requireOrgScopedService(organizationId: string, serviceId: string) {
  const service = await getOrgScopedService(db, organizationId, serviceId);
  if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "Service not found" });
  return service;
}

export const envVarsRouter = router({
  list: protectedProcedure
    .input(z.object({ serviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return listEnvVars(input.serviceId);
    }),

  set: writeProcedure.input(setEnvVarInputSchema).mutation(async ({ ctx, input }) => {
    await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
    return setEnvVar(ctx.auth.organizationId, ctx.auth.userId, input);
  }),

  setBulk: writeProcedure.input(bulkSetEnvVarsInputSchema).mutation(async ({ ctx, input }) => {
    await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
    await setEnvVarsBulk(ctx.auth.organizationId, ctx.auth.userId, input);
    return { success: true };
  }),

  reveal: writeProcedure
    .input(z.object({ serviceId: z.string().uuid(), envVarId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return revealEnvVar(ctx.auth.organizationId, ctx.auth.userId, input.serviceId, input.envVarId);
    }),

  revealAllByScope: writeProcedure
    .input(z.object({ serviceId: z.string().uuid(), scope: envVarScopeSchema }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return revealEnvVarsByScope(ctx.auth.organizationId, ctx.auth.userId, input.serviceId, input.scope);
    }),

  delete: writeProcedure
    .input(z.object({ serviceId: z.string().uuid(), envVarId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      await deleteEnvVar(ctx.auth.organizationId, ctx.auth.userId, input.serviceId, input.envVarId);
      return { success: true };
    }),

  listLinkableServices: protectedProcedure
    .input(z.object({ serviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return listLinkableServices(ctx.auth.organizationId, input.serviceId);
    }),
});
