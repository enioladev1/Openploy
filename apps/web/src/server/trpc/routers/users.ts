import "server-only";
import { z } from "zod";
import { createUserInputSchema, updateUserRoleInputSchema } from "@openploy/shared";
import { createUser, listUsers, removeUser, updateUserRole } from "../../services/users-service";
import { ownerProcedure, router } from "../trpc";

// Owner-gated throughout: managing who can access this installation at all
// is a step above what an "admin" role should grant, same rationale as
// diskUsageRouter - a host-wide capability, not a per-resource IDOR check.
export const usersRouter = router({
  list: ownerProcedure.query(({ ctx }) => listUsers(ctx.auth.organizationId)),

  create: ownerProcedure
    .input(createUserInputSchema)
    .mutation(({ ctx, input }) => createUser(ctx.auth.organizationId, ctx.auth.userId, input)),

  updateRole: ownerProcedure.input(updateUserRoleInputSchema).mutation(async ({ ctx, input }) => {
    await updateUserRole(ctx.auth.organizationId, ctx.auth.userId, input.userId, input.role);
    return { success: true };
  }),

  remove: ownerProcedure.input(z.object({ userId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await removeUser(ctx.auth.organizationId, ctx.auth.userId, input.userId);
    return { success: true };
  }),
});
