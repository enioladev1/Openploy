import { streamServiceLogs, type LogStreamHandle } from "@openploy/docker";
import { createLogWriter } from "./log-writer";

const activeTails = new Map<string, LogStreamHandle>();

/**
 * At most one live tail per Swarm service name. Redeploying a service starts
 * a fresh tail (new deploymentId to attribute lines to) and stops the old one
 * first, so tails never accumulate across repeated deploys.
 *
 * since is 0 (the container's own beginning), not "now": streamServiceLogs
 * resolves and tails the one specific container currently backing the
 * service, so there's no risk of replaying a previous container's history the
 * way there would be if tailing at the service level - starting from 0 just
 * means the new container's own startup lines aren't truncated.
 */
export async function startRuntimeLogTail(
  serviceName: string,
  deploymentId: string,
  redact: (line: string) => string,
): Promise<void> {
  activeTails.get(serviceName)?.stop();
  activeTails.delete(serviceName);

  const writer = createLogWriter(deploymentId, redact);
  const handle = await streamServiceLogs(serviceName, (entry) => {
    // Fire-and-forget by design (this callback can't be async), but a
    // failed write - e.g. the deployment/service was deleted out from
    // under a still-running tail - must never become an unhandled
    // rejection: that crashes the whole agent process, taking every
    // other service's job processing down with it.
    writer.write("runtime", entry.line).catch((err) => {
      console.error(`[runtime-logs] failed to write a log line for "${serviceName}":`, err);
    });
  });

  activeTails.set(serviceName, handle);
}

export function stopRuntimeLogTail(serviceName: string): void {
  activeTails.get(serviceName)?.stop();
  activeTails.delete(serviceName);
}
