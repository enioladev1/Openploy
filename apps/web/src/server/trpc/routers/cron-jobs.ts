import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getOrgScopedService } from "@openploy/db";
import { createCronJobInputSchema, updateCronJobInputSchema } from "@openploy/shared";
import {
  createCronJob,
  deleteCronJob,
  listCronJobRuns,
  listCronJobs,
  setCronJobEnabled,
  triggerCronJobNow,
  updateCronJob,
} from "../../services/cron-job-service";
import { db } from "../../db";
import { protectedProcedure, router, writeProcedure } from "../trpc";

async function requireOrgScopedService(organizationId: string, serviceId: string) {
  const service = await getOrgScopedService(db, organizationId, serviceId);
  if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "Service not found" });
  return service;
}

export const cronJobsRouter = router({
  list: protectedProcedure
    .input(z.object({ serviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return listCronJobs(input.serviceId);
    }),

  create: writeProcedure.input(createCronJobInputSchema).mutation(async ({ ctx, input }) => {
    await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
    return createCronJob(input);
  }),

  update: writeProcedure.input(updateCronJobInputSchema).mutation(({ ctx, input }) => updateCronJob(ctx.auth.organizationId, input)),

  setEnabled: writeProcedure
    .input(z.object({ id: z.string().uuid(), isEnabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await setCronJobEnabled(ctx.auth.organizationId, input.id, input.isEnabled);
      return { success: true };
    }),

  delete: writeProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await deleteCronJob(ctx.auth.organizationId, input.id);
    return { success: true };
  }),

  runNow: writeProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await triggerCronJobNow(ctx.auth.organizationId, input.id);
    return { success: true };
  }),

  listRuns: protectedProcedure
    .input(z.object({ cronJobId: z.string().uuid() }))
    .query(({ ctx, input }) => listCronJobRuns(ctx.auth.organizationId, input.cronJobId)),
});
