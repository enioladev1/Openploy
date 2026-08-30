import "server-only";
import { z } from "zod";
import { createServerInputSchema } from "@openploy/shared";
import { confirmServerAndJoin, createServer, listServers } from "../../services/server-service";
import { protectedProcedure, router, writeProcedure } from "../trpc";

export const serversRouter = router({
  list: protectedProcedure.query(({ ctx }) => listServers(ctx.auth.organizationId)),

  create: writeProcedure
    .input(createServerInputSchema)
    .mutation(({ ctx, input }) => createServer(ctx.auth.organizationId, input)),

  confirmAndJoin: writeProcedure
    .input(z.object({ serverId: z.string().uuid() }))
    .mutation(({ ctx, input }) => confirmServerAndJoin(ctx.auth.organizationId, input.serverId)),
});
