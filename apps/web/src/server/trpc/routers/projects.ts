import "server-only";
import { createProjectInputSchema, updateProjectInputSchema } from "@openploy/shared";
import { z } from "zod";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  listServiceLinksForProject,
  listServicesForProjectWithDeployStatus,
  updateProject,
} from "../../services/project-service";
import { protectedProcedure, router, writeProcedure } from "../trpc";

export const projectsRouter = router({
  list: protectedProcedure.query(({ ctx }) => listProjects(ctx.auth.organizationId)),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => getProject(ctx.auth.organizationId, input.id)),

  listServices: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await getProject(ctx.auth.organizationId, input.id);
      return listServicesForProjectWithDeployStatus(input.id);
    }),

  listServiceLinks: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await getProject(ctx.auth.organizationId, input.id);
      return listServiceLinksForProject(input.id);
    }),

  create: writeProcedure
    .input(createProjectInputSchema)
    .mutation(({ ctx, input }) => createProject(ctx.auth.organizationId, ctx.auth.userId, input)),

  update: writeProcedure
    .input(updateProjectInputSchema)
    .mutation(({ ctx, input }) => updateProject(ctx.auth.organizationId, input)),

  delete: writeProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await deleteProject(ctx.auth.organizationId, input.id);
      return { success: true };
    }),
});
