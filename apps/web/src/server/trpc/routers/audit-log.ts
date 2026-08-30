import "server-only";
import { z } from "zod";
import { listAuditLogs } from "../../services/audit-log-service";
import { ownerProcedure, router } from "../trpc";

// Owner-gated, list-only - this router deliberately has no update/delete
// procedure. There is nothing in this codebase that can mutate an
// audit_logs row once written; see logAuditEvent in server/audit.ts.
export const auditLogRouter = router({
  list: ownerProcedure
    .input(z.object({ page: z.number().int().min(1).default(1) }))
    .query(({ ctx, input }) => listAuditLogs(ctx.auth.organizationId, input.page)),
});
