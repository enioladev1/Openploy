import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { composeServices, deployments, services } from "@openploy/db";
import { downloadAndExtractSource } from "@openploy/github";
import { deployStack, pullImageWithProgress } from "@openploy/docker";
import {
  interpolateComposeVariables,
  mergeComposeConfig,
  normalizeForSwarm,
  parseComposeYaml,
  serializeCompose,
  validateComposeSafety,
} from "@openploy/compose";
import type { DeployComposeJob } from "@openploy/shared";
import { db } from "../db";
import { isDeploymentCanceled, watchForCancellation } from "../deployment-cancellation";
import { loadDecryptedEnvVars } from "../env-vars";
import { getInstallationTokenForRow } from "../github-token";
import { createLogWriter, type LogWriter } from "../log-writer";
import { buildRedactor } from "../redact";
import { notifyServiceEvent } from "../notifications";
import { finalizeServiceRunState, resolveRuntimeStatusChangedAt } from "../service-lifecycle";
import { syncDomainsForService } from "../traefik-sync";

function getStacksDir(): string {
  return process.env.STACKS_DIR ?? "/var/lib/openploy/stacks";
}

function getWorkspaceDir(deploymentId: string): string {
  const base = process.env.WORKSPACE_DIR ?? "/var/lib/openploy/builds";
  return `${base}/${deploymentId}`;
}

/** Always writes the reason to the deployment's build log - a "Failed" status with no log line is a dead end for the user. */
async function markFailed(logWriter: LogWriter, deploymentId: string, serviceId: string, reason: string): Promise<void> {
  await logWriter.write("build", `Deployment failed: ${reason}`);
  await db
    .update(deployments)
    .set({ status: "failed", failureReason: reason.slice(0, 4000), finishedAt: new Date() })
    .where(eq(deployments.id, deploymentId));
  await db
    .update(services)
    .set({ runtimeStatus: "failed", runtimeStatusChangedAt: new Date() })
    .where(eq(services.id, serviceId));
  await notifyServiceEvent(serviceId, "deployment_failed");
}

export async function processDeployComposeJob(job: DeployComposeJob): Promise<void> {
  const deployment = await db.query.deployments.findFirst({ where: eq(deployments.id, job.deploymentId) });
  if (!deployment) throw new Error(`Deployment not found: ${job.deploymentId}`);

  // Atomic claim - see deploy-application.ts's identical guard for why: a
  // pg-boss redelivery of a job that's still legitimately running past its
  // expiry must never be allowed to start a second concurrent deploy.
  const [claimed] = await db
    .update(deployments)
    .set({ status: "building", startedAt: new Date() })
    .where(and(eq(deployments.id, deployment.id), eq(deployments.status, "queued")))
    .returning();
  if (!claimed) {
    console.log(`[deploy-compose] deployment ${deployment.id} already claimed (status was "${deployment.status}") - skipping duplicate delivery`);
    return;
  }

  const envVars = await loadDecryptedEnvVars(deployment.serviceId);
  const redact = buildRedactor(envVars.secretValues);
  const logWriter = createLogWriter(deployment.id, redact);
  const onLine = (line: string) => {
    logWriter.write("build", line).catch((err) => console.error("[deploy-compose] failed to write log line:", err));
  };

  const composeService = await db.query.composeServices.findFirst({
    where: eq(composeServices.serviceId, deployment.serviceId),
  });
  if (!composeService) return markFailed(logWriter, deployment.id, deployment.serviceId, "Compose service configuration not found");

  const abortController = new AbortController();
  const cancellationWatch = watchForCancellation(deployment.id, abortController);

  try {
    if (composeService.sourceType === null) {
      return markFailed(logWriter, deployment.id, deployment.serviceId, "Compose service has no source configured yet");
    }

    let rawYaml: string;
    if (composeService.sourceType === "raw") {
      if (!composeService.rawComposeContent) return markFailed(logWriter, deployment.id, deployment.serviceId, "No compose content was provided");
      rawYaml = composeService.rawComposeContent;
    } else {
      if (
        !composeService.githubInstallationId ||
        !composeService.repoOwner ||
        !composeService.repoName ||
        !composeService.branch ||
        !composeService.composeFilePath
      ) {
        return markFailed(logWriter, deployment.id, deployment.serviceId, "Compose service is not fully configured (missing repo/branch/path)");
      }
      const token = await getInstallationTokenForRow(composeService.githubInstallationId);
      const workspaceDir = getWorkspaceDir(deployment.id);
      await downloadAndExtractSource(
        token,
        composeService.repoOwner,
        composeService.repoName,
        composeService.branch,
        workspaceDir,
      );
      rawYaml = await readFile(path.join(workspaceDir, composeService.composeFilePath), "utf8");
    }

    // Docker Compose's own variable interpolation (${VAR} / ${VAR:-default}),
    // resolved from this service's configured env vars before the file is even
    // parsed - a reference can appear anywhere in the file (image tags, ports,
    // an inner service's own environment: list), not just wherever we inject
    // platform-managed vars via mergeComposeConfig below.
    const allEnvVars = { ...envVars.build, ...envVars.runtime };
    const interpolation = interpolateComposeVariables(rawYaml, allEnvVars);
    if (interpolation.missingVariables.length > 0) {
      return markFailed(
        logWriter,
        deployment.id,
        deployment.serviceId,
        `Compose file references variables with no value and no default: ${interpolation.missingVariables.join(", ")}. Set them in Environment variables.`,
      );
    }

    const parsed = parseComposeYaml(interpolation.yaml);
    normalizeForSwarm(parsed);
    const validation = validateComposeSafety(parsed);
    if (!validation.valid) {
      return markFailed(logWriter, deployment.id, deployment.serviceId, `Compose file failed safety validation: ${validation.errors.join("; ")}`);
    }

    const stackName = `stack-${deployment.serviceId}`;

    if (composeService.exposedInnerService) {
      if (!parsed.services?.[composeService.exposedInnerService]) {
        return markFailed(
          logWriter,
          deployment.id,
          deployment.serviceId,
          `exposedInnerService "${composeService.exposedInnerService}" is not a service in this compose file`,
        );
      }
      mergeComposeConfig(parsed, {
        targetServiceName: composeService.exposedInnerService,
        envVars: envVars.runtime,
        networkName: "platform_internal",
      });
    }

    const renderedYaml = serializeCompose(parsed);
    const stackDir = path.join(getStacksDir(), deployment.serviceId);
    await mkdir(stackDir, { recursive: true });
    // Platform-generated path keyed by our own UUIDs only - never derived from
    // user-supplied filenames or compose content, per the compose safety design.
    const composeFilePath = path.join(stackDir, `${deployment.id}.yml`);
    await writeFile(composeFilePath, renderedYaml, "utf8");

    // docker stack deploy only submits the stack spec to Swarm and returns -
    // each inner service's image still gets pulled lazily/invisibly whenever
    // Swarm schedules its task, same as any other service. Pulling every
    // distinct image explicitly here first is what actually surfaces that
    // progress into this deployment's build log.
    const imagesToPull = new Set(
      Object.values(parsed.services ?? {})
        .map((service) => service.image)
        .filter((image): image is string => Boolean(image)),
    );
    for (const image of imagesToPull) {
      // pullImageWithProgress isn't itself abortable mid-pull (dockerode
      // stream, no subprocess to kill) - checking between each pull still
      // gets a cancel to take effect within one image's pull time instead of
      // silently finishing the whole stack.
      if (abortController.signal.aborted) throw new Error("Canceled");
      await pullImageWithProgress(image, onLine);
    }

    if (abortController.signal.aborted) throw new Error("Canceled");
    await db.update(deployments).set({ status: "deploying" }).where(eq(deployments.id, deployment.id));
    await deployStack(stackName, composeFilePath, onLine, abortController.signal);

    // Only the designated exposed service has a predictable Swarm service name
    // to watch/tail - a stack can define several services, and without one
    // singled out there's no single "the container" for status or log purposes.
    let finalState: "pending" | "running" | "failed" | "unknown" = "unknown";
    let targetServiceName: string | null = null;
    if (composeService.exposedInnerService) {
      targetServiceName = `${stackName}_${composeService.exposedInnerService}`;
      await syncDomainsForService(deployment.serviceId, targetServiceName);
      finalState = await finalizeServiceRunState(targetServiceName, deployment.serviceId, deployment.id, redact);
    }
    const runtimeStatusChangedAt = targetServiceName
      ? await resolveRuntimeStatusChangedAt(targetServiceName, finalState)
      : new Date();

    await db
      .update(deployments)
      .set({ status: "success", finishedAt: new Date() })
      .where(eq(deployments.id, deployment.id));
    await db
      .update(services)
      .set({ currentDeploymentId: deployment.id, runtimeStatus: finalState, runtimeStatusChangedAt })
      .where(eq(services.id, deployment.serviceId));
    await notifyServiceEvent(deployment.serviceId, "deployment_success", {
      durationSeconds: claimed.startedAt ? (Date.now() - claimed.startedAt.getTime()) / 1000 : undefined,
    });
  } catch (err) {
    // See deploy-application.ts's identical guard - deployments.cancel
    // already set status to "canceled", markFailed would overwrite it.
    if (await isDeploymentCanceled(deployment.id)) {
      await logWriter.write("build", "Deployment canceled");
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(logWriter, deployment.id, deployment.serviceId, message);
  } finally {
    cancellationWatch.stop();
  }
}
