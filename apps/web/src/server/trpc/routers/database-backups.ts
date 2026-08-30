import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getOrgScopedService } from "@openploy/db";
import { createBackupScheduleInputSchema } from "@openploy/shared";
import {
  createBackupSchedule,
  deleteBackupSchedule,
  listBackupSchedules,
  setBackupScheduleEnabled,
  triggerBackupNow,
} from "../../services/database-backup-service";
import { db } from "../../db";
import { protectedProcedure, router, writeProcedure } from "../trpc";

async function requireOrgScopedService(organizationId: string, serviceId: string) {
  const service = await getOrgScopedService(db, organizationId, serviceId);
  if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "Service not found" });
  return service;
}

export const databaseBackupsRouter = router({
  list: protectedProcedure
    .input(z.object({ serviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return listBackupSchedules(input.serviceId);
    }),

  create: writeProcedure
    .input(createBackupScheduleInputSchema)
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return createBackupSchedule(ctx.auth.organizationId, input);
    }),

  setEnabled: writeProcedure
    .input(z.object({ id: z.string().uuid(), isEnabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await setBackupScheduleEnabled(ctx.auth.organizationId, input.id, input.isEnabled);
      return { success: true };
    }),

  delete: writeProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await deleteBackupSchedule(ctx.auth.organizationId, input.id);
      return { success: true };
    }),

  runNow: writeProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await triggerBackupNow(ctx.auth.organizationId, input.id);
      return { success: true };
    }),
});
