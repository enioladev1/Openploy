import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getOrgScopedService } from "@openploy/db";
import { debugLogs } from "@openploy/ai-providers";
import { getEnabledAiProviderConfig } from "../../services/ai-provider-service";
import { getDeployment, getFullDeploymentLog, getOrgScopedCurrentDeploymentId } from "../../services/deployment-service";
import { db } from "../../db";
import { writeProcedure, router } from "../trpc";

async function requireOrgScopedService(organizationId: string, serviceId: string) {
  const service = await getOrgScopedService(db, organizationId, serviceId);
  if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "Service not found" });
  return service;
}

// Log text is always re-fetched server-side from a validated id, never
// accepted as client input - closes off using this as a free relay to burn
// the org's AI provider spend on arbitrary text. writeProcedure-gated (same
// level as deployments.trigger/cancel) since using an already-configured
// provider isn't a credential-management action, unlike aiProvidersRouter's CRUD.
export const aiDebugRouter = router({
  debugDeploymentLog: writeProcedure
    .input(z.object({ serviceId: z.string().uuid(), deploymentId: z.string().uuid(), providerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireOrgScopedService(ctx.auth.organizationId, input.serviceId);
      await getDeployment(input.serviceId, input.deploymentId);
      const logText = await getFullDeploymentLog(input.deploymentId, "build");
      const config = await getEnabledAiProviderConfig(ctx.auth.organizationId, input.providerId);
      const analysis = await debugLogs(config, logText);
      return { analysis };
    }),

  debugContainerLog: writeProcedure
    .input(z.object({ serviceId: z.string().uuid(), providerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deploymentId = await getOrgScopedCurrentDeploymentId(ctx.auth.organizationId, input.serviceId);
      if (!deploymentId) throw new TRPCError({ code: "NOT_FOUND", message: "No active deployment for this service yet" });
      const logText = await getFullDeploymentLog(deploymentId, "runtime");
      const config = await getEnabledAiProviderConfig(ctx.auth.organizationId, input.providerId);
      const analysis = await debugLogs(config, logText);
      return { analysis };
    }),
});
