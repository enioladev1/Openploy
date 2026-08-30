import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getOrgScopedService } from "@openploy/db";
import {
  applicationConfigInputSchema,
  composeSourceInputSchema,
  createDatabaseServiceInputSchema,
  createServiceShellInputSchema,
  renameServiceInputSchema,
} from "@openploy/shared";
import {
  createApplicationServiceShell,
  getApplicationServiceDetail,
  setApplicationConfig,
  setAutoDeployOnPush,
} from "../../services/application-service";
import { getStaticUploadInfo } from "../../services/static-upload-service";
import {
  createDatabaseService,
  getDatabaseServiceDetail,
  revealDatabasePassword,
  revealDatabaseRootPassword,
} from "../../services/database-service";
import {
  createComposeServiceShell,
  getComposeServiceDetail,
  setComposeSource,
  setExposedInnerService,
} from "../../services/compose-service";
import { bulkDeleteServices, bulkStartServices, bulkStopServices } from "../../services/bulk-service-actions";
import { isServiceDeploying } from "../../services/deployment-service";
import { deleteService } from "../../services/service-deletion";
import { reloadService, startService, stopService } from "../../services/service-lifecycle";
import { renameService } from "../../services/service-rename";
import { db } from "../../db";
import { protectedProcedure, router, writeProcedure } from "../trpc";

async function requireOrgScopedService(organizationId: string, serviceId: string) {
  const service = await getOrgScopedService(db, organizationId, serviceId);
  if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "Service not found" });
  return service;
}

export const servicesRouter = router({
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const service = await requireOrgScopedService(ctx.auth.organizationId, input.id);
      const isDeploying = await isServiceDeploying(service.id);
      return { ...service, isDeploying };
    }),

  delete: writeProcedure
    .input(z.object({ id: z.string().uuid(), deleteVolumes: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.id);
      return deleteService(ctx.auth.organizationId, ctx.auth.userId, input.id, input.deleteVolumes);
    }),

  rename: writeProcedure
    .input(renameServiceInputSchema)
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return renameService(input);
    }),

  reload: writeProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.id);
      await reloadService(input.id);
      return { success: true };
    }),

  stop: writeProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.id);
      await stopService(input.id);
      return { success: true };
    }),

  start: writeProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.id);
      await startService(input.id);
      return { success: true };
    }),

  // Bulk mutations resolve org-ownership per id internally (see
  // bulk-service-actions.ts) - no requireOrgScopedService pre-check here,
  // since that's the batched equivalent of it, not a skip of it.
  bulkDelete: writeProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1), deleteVolumes: z.boolean().default(false) }))
    .mutation(({ ctx, input }) =>
      bulkDeleteServices(ctx.auth.organizationId, ctx.auth.userId, input.ids, input.deleteVolumes),
    ),

  bulkStop: writeProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
    .mutation(({ ctx, input }) => bulkStopServices(ctx.auth.organizationId, input.ids)),

  bulkStart: writeProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
    .mutation(({ ctx, input }) => bulkStartServices(ctx.auth.organizationId, input.ids)),

  createApplicationShell: writeProcedure
    .input(createServiceShellInputSchema)
    .mutation(({ ctx, input }) => createApplicationServiceShell(ctx.auth.organizationId, ctx.auth.userId, input)),

  getApplicationDetail: protectedProcedure
    .input(z.object({ serviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return getApplicationServiceDetail(input.serviceId);
    }),

  setApplicationConfig: writeProcedure
    .input(applicationConfigInputSchema)
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return setApplicationConfig(ctx.auth.organizationId, input);
    }),

  setAutoDeployOnPush: writeProcedure
    .input(z.object({ serviceId: z.string().uuid(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return setAutoDeployOnPush(input.serviceId, input.enabled);
    }),

  getStaticUploadInfo: protectedProcedure
    .input(z.object({ serviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return getStaticUploadInfo(input.serviceId);
    }),

  createDatabase: writeProcedure
    .input(createDatabaseServiceInputSchema)
    .mutation(({ ctx, input }) => createDatabaseService(ctx.auth.organizationId, ctx.auth.userId, input)),

  getDatabaseDetail: protectedProcedure
    .input(z.object({ serviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return getDatabaseServiceDetail(input.serviceId);
    }),

  revealDatabasePassword: writeProcedure
    .input(z.object({ serviceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return revealDatabasePassword(ctx.auth.organizationId, ctx.auth.userId, input.serviceId);
    }),

  revealDatabaseRootPassword: writeProcedure
    .input(z.object({ serviceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return revealDatabaseRootPassword(ctx.auth.organizationId, ctx.auth.userId, input.serviceId);
    }),

  createComposeShell: writeProcedure
    .input(createServiceShellInputSchema)
    .mutation(({ ctx, input }) => createComposeServiceShell(ctx.auth.organizationId, ctx.auth.userId, input)),

  getComposeDetail: protectedProcedure
    .input(z.object({ serviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return getComposeServiceDetail(input.serviceId);
    }),

  setComposeSource: writeProcedure
    .input(composeSourceInputSchema)
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return setComposeSource(ctx.auth.organizationId, input);
    }),

  setExposedInnerService: writeProcedure
    .input(z.object({ serviceId: z.string().uuid(), exposedInnerService: z.string().max(200).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      return setExposedInnerService(input.serviceId, input.exposedInnerService);
    }),
});
