import "server-only";
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { applicationServices, deploymentLogs, deployments, getOrgScopedService, services } from "@openploy/db";
import { JOB_DEPLOY_APPLICATION, JOB_DEPLOY_COMPOSE } from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { db } from "../db";
import { ForbiddenError, NotFoundError } from "../errors";

export async function triggerWebhookDeployments(
  githubInstallationRowId: string,
  repoOwner: string,
  repoName: string,
  branch: string,
  commit: { sha: string | null; message: string | null; author: string | null },
  deliveryId: string,
) {
  const matches = await db.query.applicationServices.findMany({
    where: and(
      eq(applicationServices.githubInstallationId, githubInstallationRowId),
      eq(applicationServices.repoOwner, repoOwner),
      eq(applicationServices.repoName, repoName),
      eq(applicationServices.branch, branch),
      eq(applicationServices.autoDeployOnPush, true),
    ),
  });

  const created = [];
  for (const match of matches) {
    // One idempotency key per (service, delivery) - GitHub's at-least-once
    // redelivery of the same event must not double-deploy the same service.
    const idempotencyKey = `webhook:${deliveryId}`;

    const existing = await db.query.deployments.findFirst({
      where: and(eq(deployments.serviceId, match.serviceId), eq(deployments.idempotencyKey, idempotencyKey)),
    });
    if (existing) continue;

    const [row] = await db
      .insert(deployments)
      .values({
        serviceId: match.serviceId,
        status: "queued",
        triggeredBy: "webhook",
        idempotencyKey,
        commitSha: commit.sha,
        commitMessage: commit.message,
        commitAuthor: commit.author,
      })
      .returning();
    if (row) {
      created.push(row);
      await enqueueJob(JOB_DEPLOY_APPLICATION, { deploymentId: row.id });
    }
  }

  return created;
}

// Callers MUST resolve serviceId through getOrgScopedService (or equivalent)
// before calling this - it does not itself check that the caller's org owns the service.
export async function triggerManualDeployment(serviceId: string, userId: string, idempotencyKey: string) {
  const service = await db.query.services.findFirst({ where: eq(services.id, serviceId) });
  if (!service) throw new NotFoundError("Service not found");
  if (service.type !== "application" && service.type !== "compose") {
    throw new Error(`Service type "${service.type}" is not deployable via this trigger`);
  }

  const existing = await db.query.deployments.findFirst({
    where: and(eq(deployments.serviceId, serviceId), eq(deployments.idempotencyKey, idempotencyKey)),
  });
  if (existing) return existing;

  const [row] = await db
    .insert(deployments)
    .values({ serviceId, status: "queued", triggeredBy: "manual", triggeredByUserId: userId, idempotencyKey })
    .returning();
  if (!row) throw new Error("Failed to create deployment");

  await enqueueJob(service.type === "application" ? JOB_DEPLOY_APPLICATION : JOB_DEPLOY_COMPOSE, {
    deploymentId: row.id,
  });

  return row;
}

const IN_FLIGHT_DEPLOYMENT_STATUSES = new Set<(typeof deployments.$inferSelect)["status"]>(["queued", "building", "deploying"]);

/**
 * service.runtimeStatus alone can't show an in-progress deploy: it's
 * "unknown" until a service's first deploy ever finishes, and for a redeploy
 * of an already-running service it just stays "running" throughout - the
 * service's latest deployment status is the only thing that actually knows
 * a deploy is in flight right now. Callers MUST resolve serviceId through
 * getOrgScopedService before calling this.
 */
export async function isServiceDeploying(serviceId: string): Promise<boolean> {
  const latest = await db.query.deployments.findFirst({
    where: eq(deployments.serviceId, serviceId),
    orderBy: [desc(deployments.createdAt)],
  });
  return latest ? IN_FLIGHT_DEPLOYMENT_STATUSES.has(latest.status) : false;
}

// Callers MUST resolve serviceId through getOrgScopedService before calling this.
export async function listDeployments(serviceId: string) {
  return db.query.deployments.findMany({
    where: eq(deployments.serviceId, serviceId),
    orderBy: [desc(deployments.createdAt)],
    limit: 50,
  });
}

export async function getDeployment(serviceId: string, deploymentId: string) {
  const deployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, deploymentId), eq(deployments.serviceId, serviceId)),
  });
  if (!deployment) throw new NotFoundError("Deployment not found");
  return deployment;
}

/**
 * Only flips the DB row here - the agent is the one actually watching for
 * this (polling, since there's no push channel to it) and stopping the real
 * work in progress; see apps/agent/src/deployment-cancellation.ts. A
 * still-queued job simply never gets claimed once this fires, since the
 * worker's atomic claim requires status="queued".
 */
export async function cancelDeployment(serviceId: string, deploymentId: string) {
  const deployment = await getDeployment(serviceId, deploymentId);
  if (!IN_FLIGHT_DEPLOYMENT_STATUSES.has(deployment.status)) {
    throw new ForbiddenError(`Cannot cancel a deployment that's already ${deployment.status}`);
  }

  // Re-checks status in the WHERE, not just at the read above - closes the
  // (rare, fast-path-only) gap where the deploy could finish between that
  // read and this write, which would otherwise stomp a real "success" with
  // "canceled" after the fact.
  const [updated] = await db
    .update(deployments)
    .set({ status: "canceled", finishedAt: new Date(), failureReason: "Canceled by user" })
    .where(
      and(
        eq(deployments.id, deploymentId),
        eq(deployments.serviceId, serviceId),
        inArray(deployments.status, [...IN_FLIGHT_DEPLOYMENT_STATUSES]),
      ),
    )
    .returning();
  if (!updated) throw new ForbiddenError("This deployment just finished - it can no longer be canceled");
  return updated;
}

/** IDOR check for the SSE route, which only has a deploymentId in the URL (no serviceId to scope through). */
export async function getOrgScopedDeployment(organizationId: string, deploymentId: string) {
  const deployment = await db.query.deployments.findFirst({ where: eq(deployments.id, deploymentId) });
  if (!deployment) return null;
  const service = await getOrgScopedService(db, organizationId, deployment.serviceId);
  if (!service) return null;
  return deployment;
}

/**
 * "build" stream only, deliberately - runtime is the container's own live
 * stdout/stderr, which streams into deployment_logs for as long as the
 * container runs (see runtime-logs.ts), not just for the duration of this
 * deployment. Without this filter, the Deployments tab would show the exact
 * same rows the Container logs tab already shows for the current deployment,
 * duplicated and permanently baked into this deployment's history.
 */
export async function getDeploymentLogsSince(deploymentId: string, afterSequence: number) {
  return db.query.deploymentLogs.findMany({
    where: and(
      eq(deploymentLogs.deploymentId, deploymentId),
      eq(deploymentLogs.stream, "build"),
      gt(deploymentLogs.sequence, afterSequence),
    ),
    orderBy: [asc(deploymentLogs.sequence)],
  });
}

export async function getRuntimeLogsSince(deploymentId: string, afterSequence: number) {
  return db.query.deploymentLogs.findMany({
    where: and(
      eq(deploymentLogs.deploymentId, deploymentId),
      eq(deploymentLogs.stream, "runtime"),
      gt(deploymentLogs.sequence, afterSequence),
    ),
    orderBy: [asc(deploymentLogs.sequence)],
  });
}

/** Unbounded (no `since` cursor) - used by the AI debug feature, which needs the whole log text rather than a page to tail. */
export async function getFullDeploymentLog(deploymentId: string, stream: "build" | "runtime"): Promise<string> {
  const rows = await db.query.deploymentLogs.findMany({
    where: and(eq(deploymentLogs.deploymentId, deploymentId), eq(deploymentLogs.stream, stream)),
    orderBy: [asc(deploymentLogs.sequence)],
  });
  return rows.map((row) => row.content).join("\n");
}

const TERMINAL_STATUSES = new Set(["success", "failed", "canceled"]);

export async function isDeploymentTerminal(deploymentId: string): Promise<boolean> {
  const deployment = await db.query.deployments.findFirst({ where: eq(deployments.id, deploymentId) });
  return !deployment || TERMINAL_STATUSES.has(deployment.status);
}

/**
 * For the container-logs SSE route, which only has a serviceId (there's no
 * per-deployment "container logs" URL from the UI - you always want whatever
 * is currently running, not a specific historical deploy's tail).
 */
export async function getOrgScopedCurrentDeploymentId(
  organizationId: string,
  serviceId: string,
): Promise<string | null> {
  const service = await getOrgScopedService(db, organizationId, serviceId);
  return service?.currentDeploymentId ?? null;
}
