import { getServiceRunningSince, waitForServiceRunState, type ServiceRunState } from "@openploy/docker";
import { JOB_CHECK_SERVICE_RUN_STATE } from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { createLogWriter } from "./log-writer";
import { startRuntimeLogTail } from "./runtime-logs";

/**
 * Multi-service compose stacks (and any first pull of a large/uncached
 * image) routinely take longer than the initial wait below to actually come
 * up - that's "still starting," not a failure. Enqueues a durable, self-requeuing
 * job rather than watching in-process, so runtimeStatus doesn't stay stuck on
 * "pending" forever with nothing ever re-checking it - including across an
 * agent restart, which would silently drop an in-memory watch entirely.
 */
function watchForEventualRunState(serviceName: string, serviceId: string): void {
  void enqueueJob(JOB_CHECK_SERVICE_RUN_STATE, { serviceId, serviceName, attempt: 1 }, { startAfterSeconds: 30 }).catch(
    (err) => console.error(`[service-lifecycle] failed to enqueue run-state watch for "${serviceName}":`, err),
  );
}

/**
 * Resolves the initial run state and starts tailing runtime logs as soon as
 * there's a real container to point logs at - deliberately not gated on
 * "running": a still-starting or crash-looping container's own output is
 * exactly what a user needs to see to tell the two apart, so withholding
 * logs until we're sure it's healthy hides the one thing that would explain
 * why it isn't.
 */
export async function finalizeServiceRunState(
  serviceName: string,
  serviceId: string,
  deploymentId: string,
  redact: (line: string) => string,
): Promise<ServiceRunState> {
  const finalState = await waitForServiceRunState(serviceName);

  if (finalState !== "unknown") {
    await startRuntimeLogTail(serviceName, deploymentId, redact);
  }

  if (finalState === "pending") {
    const logWriter = createLogWriter(deploymentId, redact);
    // "build" stream, not "runtime" - this is deployment-process narration,
    // not real container output, so it belongs on the Deployments tab (which
    // only shows "build") rather than Container logs (which only shows
    // "runtime" and would never be the place a user is looking for this).
    await logWriter.write(
      "build",
      `Container hasn't reported running yet (still starting - normal on a first image pull). Check the Container logs tab for its live output; status updates automatically once it's known.`,
    );
    watchForEventualRunState(serviceName, serviceId);
  } else if (finalState === "unknown") {
    const logWriter = createLogWriter(deploymentId, redact);
    await logWriter.write("build", `Could not find a container for "${serviceName}".`);
  }

  return finalState;
}

/**
 * The dashboard's uptime column reads services.runtimeStatusChangedAt, so
 * every write to it should be Docker's own idea of when the task actually
 * started running - not "whenever our code happened to run" - or a redeploy
 * that lands on the same running container (no new task) would show a reset
 * uptime that doesn't match Docker Desktop / `docker service ps`.
 */
export async function resolveRuntimeStatusChangedAt(serviceName: string, state: ServiceRunState): Promise<Date> {
  if (state !== "running") return new Date();
  const since = await getServiceRunningSince(serviceName);
  return since ?? new Date();
}
