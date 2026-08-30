import "server-only";
import { z } from "zod";
import {
  createAiProviderInputSchema,
  listAiProviderModelsInputSchema,
  testAiProviderConfigInputSchema,
  updateAiProviderInputSchema,
} from "@openploy/shared";
import {
  createAiProvider,
  deleteAiProvider,
  listAiProviderModels,
  listAiProviders,
  listEnabledAiProviders,
  testAiProviderConfig,
  testSavedAiProvider,
  updateAiProvider,
} from "../../services/ai-provider-service";
import { ownerProcedure, protectedProcedure, router } from "../trpc";

// Owner-gated throughout except listEnabled: AI provider configs hold
// third-party API keys - same host-level rationale as notificationsRouter/
// backupsRouter, not a per-row IDOR check.
export const aiProvidersRouter = router({
  list: ownerProcedure.query(({ ctx }) => listAiProviders(ctx.auth.organizationId)),

  // Read-only, id/name/provider only (no secrets/urls) - any member who can
  // already trigger a deploy can use the debug feature, so the picker needs
  // this without being able to hit the owner-gated `list` above.
  listEnabled: protectedProcedure.query(({ ctx }) => listEnabledAiProviders(ctx.auth.organizationId)),

  create: ownerProcedure.input(createAiProviderInputSchema).mutation(({ ctx, input }) => createAiProvider(ctx.auth.organizationId, input)),

  update: ownerProcedure.input(updateAiProviderInputSchema).mutation(({ ctx, input }) => updateAiProvider(ctx.auth.organizationId, input)),

  delete: ownerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => deleteAiProvider(ctx.auth.organizationId, input.id)),

  testConnection: ownerProcedure.input(testAiProviderConfigInputSchema).mutation(({ input }) => testAiProviderConfig(input)),

  testSavedConnection: ownerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => testSavedAiProvider(ctx.auth.organizationId, input.id)),

  listModels: ownerProcedure.input(listAiProviderModelsInputSchema).mutation(({ input }) => listAiProviderModels(input)),
});
