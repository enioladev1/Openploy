import { writeFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { applicationServices, deployments, services, staticUploads } from "@openploy/db";
import { downloadAndExtractSource, getLatestCommit } from "@openploy/github";
import { buildDockerfileImage, buildWithHerokuBuildpacks, createOrUpdateService, pushImage } from "@openploy/docker";
import type { DeployApplicationJob } from "@openploy/shared";
import { db } from "../db";
import { isDeploymentCanceled, watchForCancellation } from "../deployment-cancellation";
import { loadDecryptedEnvVars } from "../env-vars";
import { getInstallationTokenForRow } from "../github-token";
import { createLogWriter, type LogWriter } from "../log-writer";
import { buildRedactor } from "../redact";
import { notifyServiceEvent } from "../notifications";
import { finalizeServiceRunState, resolveRuntimeStatusChangedAt } from "../service-lifecycle";
import { extractZipToDirectory } from "../static-upload";
import { syncDomainsForService } from "../traefik-sync";

function getWorkspaceDir(deploymentId: string): string {
  const base = process.env.WORKSPACE_DIR ?? "/var/lib/openploy/builds";
  return `${base}/${deploymentId}`;
}

function getRegistryHost(): string {
  // 127.0.0.1, not the "registry" service DNS name: build/push run through
  // the host's own Docker daemon (see installer/stack.yml's registry port
  // comment), which can't resolve an overlay-network service name.
  return process.env.REGISTRY_HOST ?? "127.0.0.1:5000";
}

// nginx is a generic, always-available static file server - no build method
// choice needed here the way repo-sourced apps have Dockerfile vs buildpacks.
async function prepareStaticWorkspace(serviceId: string, workspaceDir: string, logWriter: LogWriter): Promise<void> {
  const [row] = await db
    .select({ zipData: staticUploads.zipData, filename: staticUploads.filename })
    .from(staticUploads)
    .where(eq(staticUploads.serviceId, serviceId))
    .limit(1);
  if (!row) throw new Error("No static file upload found for this service");

  await logWriter.write("build", `Extracting ${row.filename}`);
  await extractZipToDirectory(row.zipData, workspaceDir);
  await writeFile(`${workspaceDir}/Dockerfile`, "FROM nginx:alpine\nCOPY . /usr/share/nginx/html\n");
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

export async function processDeployApplicationJob(job: DeployApplicationJob): Promise<void> {
  const deployment = await db.query.deployments.findFirst({ where: eq(deployments.id, job.deploymentId) });
  if (!deployment) throw new Error(`Deployment not found: ${job.deploymentId}`);

  // Atomic claim: pg-boss can redeliver a job that's still legitimately
  // running past its expiry (see registerJobWorker's expireInHours in
  // apps/agent/src/index.ts) - only the invocation that actually flips
  // queued->building gets to proceed, so a redelivered duplicate can never
  // start a second concurrent build for the same deployment.
  const [claimed] = await db
    .update(deployments)
    .set({ status: "building", startedAt: new Date() })
    .where(and(eq(deployments.id, deployment.id), eq(deployments.status, "queued")))
    .returning();
  if (!claimed) {
    console.log(`[deploy-application] deployment ${deployment.id} already claimed (status was "${deployment.status}") - skipping duplicate delivery`);
    return;
  }

  const envVars = await loadDecryptedEnvVars(deployment.serviceId);
  const redact = buildRedactor(envVars.secretValues);
  const logWriter = createLogWriter(deployment.id, redact);

  const appService = await db.query.applicationServices.findFirst({
    where: eq(applicationServices.serviceId, deployment.serviceId),
  });
  if (!appService) return markFailed(logWriter, deployment.id, deployment.serviceId, "Application service configuration not found");
  if (appService.sourceType === "repo" || appService.sourceType === null) {
    if (!appService.githubInstallationId || !appService.repoOwner || !appService.repoName || !appService.branch) {
      return markFailed(logWriter, deployment.id, deployment.serviceId, "Application service is not fully configured (missing repo/branch)");
    }
  }

  const abortController = new AbortController();
  const cancellationWatch = watchForCancellation(deployment.id, abortController);

  try {
    const workspaceDir = getWorkspaceDir(deployment.id);
    const imageTag = `${getRegistryHost()}/app-${deployment.serviceId}:${deployment.id}`;
    const onLine = (line: string) => {
      logWriter.write("build", line).catch((err) => console.error("[deploy-application] failed to write log line:", err));
    };

    if (appService.sourceType === "static") {
      await prepareStaticWorkspace(deployment.serviceId, workspaceDir, logWriter);
      await buildDockerfileImage({
        contextDir: workspaceDir,
        dockerfileDirectory: "/",
        imageTag,
        buildArgs: {},
        onLine,
        signal: abortController.signal,
      });
    } else {
      // appService.githubInstallationId/repoOwner/repoName/branch are guaranteed
      // non-null here by the guard above (sourceType is "repo" or legacy null).
      const installationToken = await getInstallationTokenForRow(appService.githubInstallationId!);

      let commitSha = deployment.commitSha;
      if (!commitSha) {
        const commit = await getLatestCommit(
          installationToken,
          appService.repoOwner!,
          appService.repoName!,
          appService.branch!,
        );
        commitSha = commit.sha;
        await db
          .update(deployments)
          .set({ commitSha: commit.sha, commitMessage: commit.message, commitAuthor: commit.author })
          .where(eq(deployments.id, deployment.id));
      }

      await logWriter.write("build", `Fetching ${appService.repoOwner}/${appService.repoName}@${commitSha}`);
      await downloadAndExtractSource(
        installationToken,
        appService.repoOwner!,
        appService.repoName!,
        commitSha,
        workspaceDir,
      );

      if (appService.buildMethod === "dockerfile") {
        await buildDockerfileImage({
          contextDir: workspaceDir,
          dockerfileDirectory: appService.dockerfileDirectory,
          imageTag,
          buildArgs: envVars.build,
          onLine,
          signal: abortController.signal,
        });
      } else {
        await buildWithHerokuBuildpacks({
          contextDir: workspaceDir,
          imageTag,
          env: envVars.build,
          onLine,
          signal: abortController.signal,
        });
      }
    }

    await pushImage(imageTag, onLine, abortController.signal);

    // createOrUpdateService/syncDomainsForService below aren't cancellable
    // mid-call (dockerode API calls, not subprocesses with a kill signal) -
    // this is the last point where a cancel that arrived during the push can
    // still stop the deploy before it starts actually touching the running container.
    if (await isDeploymentCanceled(deployment.id)) throw new Error("Canceled");

    await db.update(deployments).set({ status: "deploying", imageTag }).where(eq(deployments.id, deployment.id));

    const serviceName = `app-${deployment.serviceId}`;
    await createOrUpdateService(
      {
        name: serviceName,
        image: imageTag,
        env: envVars.runtime,
        networks: ["platform_internal"],
        resources: { cpuLimit: appService.cpuLimit, memoryLimitMb: appService.memoryLimitMb },
      },
      onLine,
    );

    await syncDomainsForService(deployment.serviceId, serviceName);

    // Build+push+service-update all completed, so the deployment itself is a
    // "success" regardless of what happens next - but don't claim the container
    // is actually running until we've watched it get there. A crash-looping
    // container (bad CMD, missing runtime dependency, etc.) must show as
    // failed here, not silently read as healthy just because the API call succeeded.
    const finalState = await finalizeServiceRunState(serviceName, deployment.serviceId, deployment.id, redact);
    const runtimeStatusChangedAt = await resolveRuntimeStatusChangedAt(serviceName, finalState);

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
    // The deployments.cancel mutation already set status to "canceled" -
    // markFailed would incorrectly overwrite that with "failed" (the abort
    // itself surfaces here as an ordinary subprocess error, indistinguishable
    // from a real failure without re-checking the row).
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
