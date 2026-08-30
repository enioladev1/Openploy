import "server-only";
import { z } from "zod";
import { getRepoFileContent, listInstallations, listRepoBranches, listRepos } from "../../services/github-service";
import { protectedProcedure, router } from "../trpc";

export const githubRouter = router({
  listInstallations: protectedProcedure.query(({ ctx }) => listInstallations(ctx.auth.organizationId)),

  listRepos: protectedProcedure
    .input(z.object({ installationId: z.string().uuid() }))
    .query(({ ctx, input }) => listRepos(ctx.auth.organizationId, input.installationId)),

  listBranches: protectedProcedure
    .input(z.object({ installationId: z.string().uuid(), owner: z.string(), repo: z.string() }))
    .query(({ ctx, input }) => listRepoBranches(ctx.auth.organizationId, input.installationId, input.owner, input.repo)),

  getFileContent: protectedProcedure
    .input(
      z.object({
        installationId: z.string().uuid(),
        owner: z.string(),
        repo: z.string(),
        path: z.string().min(1),
        ref: z.string().min(1),
      }),
    )
    .query(({ ctx, input }) =>
      getRepoFileContent(ctx.auth.organizationId, input.installationId, input.owner, input.repo, input.path, input.ref),
    ),
});
