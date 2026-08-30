import "server-only";
import { z } from "zod";
import { backupStorageInputSchema } from "@openploy/shared";
import {
  createBackupStorageConfig,
  deleteBackupStorageConfig,
  listBackupStorageConfigs,
  retestBackupStorageConfig,
  testBackupStorageConnection,
} from "../../services/backup-storage-service";
import { ownerProcedure, router } from "../trpc";

// Owner-gated throughout: connecting/removing where backups go, and the
// credentials that grant access to them, is a host-level action - same
// rationale as diskUsageRouter, not an IDOR-style per-row check.
export const backupsRouter = router({
  list: ownerProcedure.query(({ ctx }) => listBackupStorageConfigs(ctx.auth.organizationId)),

  testConnection: ownerProcedure
    .input(backupStorageInputSchema)
    .mutation(({ input }) => testBackupStorageConnection(input)),

  create: ownerProcedure
    .input(backupStorageInputSchema)
    .mutation(({ ctx, input }) => createBackupStorageConfig(ctx.auth.organizationId, input)),

  delete: ownerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => deleteBackupStorageConfig(ctx.auth.organizationId, input.id)),

  retest: ownerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => retestBackupStorageConfig(ctx.auth.organizationId, input.id)),
});
