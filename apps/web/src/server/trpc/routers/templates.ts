import "server-only";
import { deployTemplateInputSchema, TEMPLATE_CATALOG } from "@openploy/shared";
import { deployTemplate } from "../../services/template-service";
import { protectedProcedure, router, writeProcedure } from "../trpc";

export const templatesRouter = router({
  // Client-safe metadata only (name/description/logo) - the actual compose
  // YAML per template stays server-only, see server/services/templates.
  list: protectedProcedure.query(() => TEMPLATE_CATALOG),

  deploy: writeProcedure.input(deployTemplateInputSchema).mutation(({ ctx, input }) => {
    return deployTemplate(ctx.auth.organizationId, ctx.auth.userId, input);
  }),
});
