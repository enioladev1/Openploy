import "server-only";
import { TRPCError, initTRPC } from "@trpc/server";
import { AuthError, ForbiddenError, NotFoundError, RateLimitedError } from "../errors";
import { formatZodError } from "./format-zod-error";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  // Without this, a failed .input(zodSchema) parse surfaces to the client as
  // ZodError's own message - which is the raw JSON-stringified issues array,
  // not something to show a user. Every procedure gets a readable message for free.
  errorFormatter({ shape, error }) {
    const zodMessage = formatZodError(error.cause);
    return zodMessage ? { ...shape, message: zodMessage } : shape;
  },
});

export const router = t.router;

/**
 * Service functions throughout apps/web throw these custom error classes
 * (not TRPCError directly, since they're also used from Server Actions that
 * don't know what tRPC is) - without this, every one of them would surface to
 * the client as a generic 500 instead of the actual 404/403/etc with its message.
 */
const mapKnownErrors = t.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (err) {
    if (err instanceof NotFoundError) throw new TRPCError({ code: "NOT_FOUND", message: err.message || "Not found" });
    if (err instanceof ForbiddenError) throw new TRPCError({ code: "FORBIDDEN", message: err.message || "Forbidden" });
    if (err instanceof AuthError) throw new TRPCError({ code: "UNAUTHORIZED", message: err.message || "Unauthorized" });
    if (err instanceof RateLimitedError) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: err.message });
    throw err;
  }
});

export const publicProcedure = t.procedure.use(mapKnownErrors);

/**
 * Every state-changing or resource-scoped procedure should build on this, not
 * publicProcedure - it's what guarantees ctx.auth is non-null and its
 * organizationId is what every subsequent DB lookup in the procedure must filter by.
 */
export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.auth) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, auth: ctx.auth } });
});

/**
 * For actions that aren't org-resource-scoped at all but affect the whole
 * shared host (Docker disk usage/pruning, GitHub App setup) - the risk here
 * isn't "which org owns this row" but "this member shouldn't be allowed to
 * trigger a host-level destructive action," so it's a role check, not an
 * IDOR-style resource lookup.
 */
export const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.auth.role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only an organization owner can do this" });
  }
  return next({ ctx });
});

/**
 * The single enforcement point for "member" being read-only: every mutation
 * across projects/services/env vars/domains/deployments/servers/GitHub builds
 * on this instead of protectedProcedure, so the rule lives in one place
 * rather than a per-router ad hoc check that's easy to forget on a new
 * mutation. Deliberately NOT used by profile.ts - members can always manage
 * their own account regardless of this org-wide read-only rule.
 */
export const writeProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.auth.role === "member") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Members have read-only access" });
  }
  return next({ ctx });
});
