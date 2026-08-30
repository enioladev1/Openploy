import { eq } from "drizzle-orm";
import { deployments } from "@openploy/db";
import { db } from "./db";

const POLL_INTERVAL_MS = 2000;

export async function isDeploymentCanceled(deploymentId: string): Promise<boolean> {
  const row = await db.query.deployments.findFirst({ where: eq(deployments.id, deploymentId) });
  return row?.status === "canceled";
}

/**
 * Polls for a user-initiated cancel (deployments.cancel sets status to
 * "canceled" from the web app) and fires the abort - there's no push channel
 * from web to agent, only the shared Postgres row, so polling is the only
 * option. Callers must stop() this in a finally so it doesn't outlive the job.
 */
export function watchForCancellation(deploymentId: string, controller: AbortController): { stop: () => void } {
  const interval = setInterval(async () => {
    if (await isDeploymentCanceled(deploymentId)) controller.abort();
  }, POLL_INTERVAL_MS);
  return { stop: () => clearInterval(interval) };
}
