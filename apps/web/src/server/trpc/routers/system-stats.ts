import "server-only";
import { getSystemStats } from "../../services/system-stats-service";
import { ownerProcedure, router } from "../trpc";

// Owner-gated: host-level resource, same rationale as diskUsageRouter - not
// an IDOR-style per-row check, just "who can see this host's own load."
export const systemStatsRouter = router({
  get: ownerProcedure.query(() => getSystemStats()),
});
