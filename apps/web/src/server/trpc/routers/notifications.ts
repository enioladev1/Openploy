import "server-only";
import { z } from "zod";
import {
  createNotificationChannelInputSchema,
  testNotificationConfigInputSchema,
  updateNotificationChannelInputSchema,
} from "@openploy/shared";
import {
  createNotificationChannel,
  deleteNotificationChannel,
  listNotificationChannels,
  testNotificationConfig,
  testSavedNotificationChannel,
  updateNotificationChannel,
} from "../../services/notification-service";
import { ownerProcedure, router } from "../trpc";

// Owner-gated throughout: notification channels hold third-party credentials
// (bot tokens, SMTP/Resend API keys) and control where operational alerts go -
// same host-level rationale as backupsRouter, not a per-row IDOR check.
export const notificationsRouter = router({
  list: ownerProcedure.query(({ ctx }) => listNotificationChannels(ctx.auth.organizationId)),

  create: ownerProcedure
    .input(createNotificationChannelInputSchema)
    .mutation(({ ctx, input }) => createNotificationChannel(ctx.auth.organizationId, input)),

  update: ownerProcedure
    .input(updateNotificationChannelInputSchema)
    .mutation(({ ctx, input }) => updateNotificationChannel(ctx.auth.organizationId, input)),

  delete: ownerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => deleteNotificationChannel(ctx.auth.organizationId, input.id)),

  testConnection: ownerProcedure
    .input(testNotificationConfigInputSchema)
    .mutation(({ input }) => testNotificationConfig(input.config)),

  testSavedConnection: ownerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => testSavedNotificationChannel(ctx.auth.organizationId, input.id)),
});
