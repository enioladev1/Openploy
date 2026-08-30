import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getOrgScopedService } from "@openploy/db";
import { createDomainInputSchema, generateNipIoDomainInputSchema } from "@openploy/shared";
import {
  createDomain,
  deleteDomain,
  generateNipIoDomain,
  listDomains,
  recheckCertificate,
} from "../../services/domain-service";
import { db } from "../../db";
import { protectedProcedure, router, writeProcedure } from "../trpc";

async function requireOrgScopedService(organizationId: string, serviceId: string) {
  const service = await getOrgScopedService(db, organizationId, serviceId);
  if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "Service not found" });
  return service;
}

export const domainsRouter = router({
  list: protectedProcedure
    .input(z.object({ serviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return listDomains(input.serviceId);
    }),

  create: writeProcedure.input(createDomainInputSchema).mutation(async ({ ctx, input }) => {
    await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
    return createDomain(input);
  }),

  generateNipIo: writeProcedure.input(generateNipIoDomainInputSchema).mutation(async ({ ctx, input }) => {
    await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
    return generateNipIoDomain(input);
  }),

  delete: writeProcedure
    .input(z.object({ serviceId: z.string().uuid(), domainId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      await deleteDomain(input.serviceId, input.domainId);
      return { success: true };
    }),

  recheckCertificate: writeProcedure
    .input(z.object({ serviceId: z.string().uuid(), domainId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      await recheckCertificate(input.serviceId, input.domainId);
      return { success: true };
    }),
});
