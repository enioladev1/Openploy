import { getDockerClient } from "./client";
import type { LogLineHandler } from "./exec";
import { pullImageWithProgress } from "./pull-image";

export interface ContainerServiceSpec {
  /** Deterministic name, e.g. app-<serviceId short> or db-<serviceId short>; also the internal DNS name. */
  name: string;
  image: string;
  env: Record<string, string>;
  command?: string[];
  networks: string[];
  mounts?: Array<{ volumeName: string; targetPath: string }>;
  resources: { cpuLimit: number; memoryLimitMb: number };
  replicas?: number;
  /**
   * "start-first" (the default) gives stateless services zero-downtime
   * updates/reloads. A single-replica stateful service holding an exclusive
   * lock on its own data directory (Postgres/MySQL/Redis persistence) is the
   * opposite case: starting a second instance against the same named volume
   * before the first has released it corrupts startup (Postgres in
   * particular refuses to start with "data directory lock file is invalid").
   * Those callers must pass "stop-first".
   */
  updateOrder?: "start-first" | "stop-first";
}

function toEnvList(env: Record<string, string>): string[] {
  return Object.entries(env).map(([key, value]) => `${key}=${value}`);
}

/**
 * Security defaults applied to every service this platform creates, no matter
 * the caller: hard CPU/memory ceilings so one workload can't starve the host.
 * (NoNewPrivileges is deliberately not set here - the Swarm services API has
 * no documented field for it as of Engine API 1.43; --security-opt no-new-privileges
 * is a docker-run-only flag. Track this as a known gap, not silently assumed solved.)
 *
 * Capabilities are deliberately left at Docker's own default set, not dropped
 * to ALL: virtually every official image (postgres, mysql, redis included)
 * starts its entrypoint as root and calls setuid/setgid to drop to an
 * unprivileged user before running the real daemon - that requires
 * CAP_SETUID/CAP_SETGID. Learned this the hard way: an earlier CapabilityDrop:
 * ["ALL"] here made every MySQL service crash-loop with "setgid: Operation not
 * permitted" before it ever got to check a password. Docker's default set is
 * already far short of full root (no CAP_SYS_ADMIN, no CAP_NET_ADMIN, etc.);
 * the real hardening here is no --privileged, no host mounts, no host
 * networking, and mandatory resource limits, not an aggressive blanket cap drop.
 */
function buildTaskTemplate(spec: ContainerServiceSpec) {
  return {
    ContainerSpec: {
      Image: spec.image,
      Env: toEnvList(spec.env),
      Command: spec.command,
      Mounts: spec.mounts?.map((mount) => ({
        Source: mount.volumeName,
        Target: mount.targetPath,
        Type: "volume" as const,
      })),
    },
    Networks: spec.networks.map((network) => ({ Target: network })),
    Resources: {
      Limits: {
        NanoCPUs: Math.round(spec.resources.cpuLimit * 1e9),
        MemoryBytes: spec.resources.memoryLimitMb * 1024 * 1024,
      },
    },
    RestartPolicy: { Condition: "on-failure", MaxAttempts: 5 },
  };
}

export async function findServiceByName(name: string) {
  const docker = getDockerClient();
  const services = await docker.listServices({ filters: JSON.stringify({ name: [name] }) });
  return services.find((service) => service.Spec?.Name === name) ?? null;
}

/**
 * Pulls spec.image explicitly first, streaming real Docker pull progress via
 * onLine when given - without this, Swarm just pulls the image lazily and
 * silently whenever it schedules the task, and neither this function nor its
 * caller ever sees that happen (no progress, no indication of a slow first
 * pull beyond a generic "still starting" message elsewhere). Pulling here
 * first also means createService/service.update themselves return once the
 * image is already local, rather than the pull happening invisibly after.
 */
export async function createOrUpdateService(spec: ContainerServiceSpec, onLine?: LogLineHandler): Promise<{ id: string }> {
  const docker = getDockerClient();
  if (onLine) await pullImageWithProgress(spec.image, onLine);
  const existing = await findServiceByName(spec.name);

  const serviceSpec = {
    Name: spec.name,
    TaskTemplate: buildTaskTemplate(spec),
    Mode: { Replicated: { Replicas: spec.replicas ?? 1 } },
    UpdateConfig: { Parallelism: 1, Order: spec.updateOrder ?? "start-first", FailureAction: "rollback" },
  };

  if (existing?.ID) {
    const service = docker.getService(existing.ID);
    await service.update({
      ...serviceSpec,
      version: existing.Version?.Index,
    } as never);
    return { id: existing.ID };
  }

  const created = await docker.createService(serviceSpec as never);
  return { id: created.id };
}

export async function removeService(name: string): Promise<void> {
  const existing = await findServiceByName(name);
  if (!existing?.ID) return;
  await getDockerClient().getService(existing.ID).remove();
}

/** Lists the Swarm service names deployed under a stack, via the namespace label `docker stack deploy` sets automatically. */
export async function listServicesInStack(stackName: string): Promise<string[]> {
  const docker = getDockerClient();
  const services = await docker.listServices({
    filters: JSON.stringify({ label: [`com.docker.stack.namespace=${stackName}`] }),
  });
  return services.map((service) => service.Spec?.Name).filter((name): name is string => Boolean(name));
}

/**
 * Restarts a service's running tasks in place, using its current spec and
 * image unchanged - the Swarm-native equivalent of `docker service update
 * --force`. No rebuild, no pull, no config change; just a fresh container.
 */
export async function restartService(name: string): Promise<void> {
  const existing = await findServiceByName(name);
  if (!existing?.ID) return;
  const service = getDockerClient().getService(existing.ID);
  const current = await service.inspect();
  await service.update({
    ...current.Spec,
    TaskTemplate: {
      ...current.Spec.TaskTemplate,
      ForceUpdate: (current.Spec.TaskTemplate.ForceUpdate ?? 0) + 1,
    },
    version: current.Version.Index,
  } as never);
}

/** Scales a service's replica count - 0 to stop it (route/port stays configured, no running task), back to N to bring it up again. */
export async function scaleService(name: string, replicas: number): Promise<void> {
  const existing = await findServiceByName(name);
  if (!existing?.ID) return;
  const service = getDockerClient().getService(existing.ID);
  const current = await service.inspect();
  await service.update({
    ...current.Spec,
    Mode: { Replicated: { Replicas: replicas } },
    version: current.Version.Index,
  } as never);
}

/**
 * The image reference actually deployed right now, straight from the live
 * Swarm spec - never trust a locally cached image or a DB-remembered value
 * for this, both can drift from what's really running (e.g. after a manual
 * `docker service update`). Swarm resolves this to `repo@sha256:...` itself
 * on every deploy, so it's already digest-qualified and directly comparable
 * to a registry's own latest digest.
 */
export async function getServiceImage(name: string): Promise<string | null> {
  const existing = await findServiceByName(name);
  if (!existing?.ID) return null;
  const current = await getDockerClient().getService(existing.ID).inspect();
  return current.Spec.TaskTemplate.ContainerSpec.Image ?? null;
}

/**
 * Swaps a running service onto a new (already-pulled) image, keeping
 * everything else about its spec unchanged - the self-update flow's core
 * primitive. ForceUpdate is bumped defensively alongside the image change:
 * harmless when the image genuinely differs (the normal case), but cheap
 * insurance against a no-op update if it somehow doesn't.
 */
export async function updateServiceImage(name: string, image: string): Promise<void> {
  const existing = await findServiceByName(name);
  if (!existing?.ID) return;
  const service = getDockerClient().getService(existing.ID);
  const current = await service.inspect();
  await service.update({
    ...current.Spec,
    TaskTemplate: {
      ...current.Spec.TaskTemplate,
      ContainerSpec: { ...current.Spec.TaskTemplate.ContainerSpec, Image: image },
      ForceUpdate: (current.Spec.TaskTemplate.ForceUpdate ?? 0) + 1,
    },
    version: current.Version.Index,
  } as never);
}

export type ServiceRunState = "pending" | "running" | "failed" | "unknown";

// Sorted by CreatedAt (task creation order), not UpdatedAt: during a rolling
// update the old task's UpdatedAt keeps advancing as Swarm walks it through
// its shutdown states, which can leave it looking "more recently updated"
// than the new task right around the handoff. CreatedAt is fixed at
// scheduling time, so the newest-created task is unambiguously the current
// one regardless of what either task's status is doing at query time.
async function getLatestTask(name: string, filters: Record<string, string[]> = {}) {
  const docker = getDockerClient();
  const tasks = await docker.listTasks({ filters: JSON.stringify({ service: [name], ...filters }) });
  return tasks.sort((a, b) => new Date(b.CreatedAt ?? 0).getTime() - new Date(a.CreatedAt ?? 0).getTime())[0];
}

export async function getServiceRunState(name: string): Promise<ServiceRunState> {
  const existing = await findServiceByName(name);
  if (!existing?.ID) return "unknown";

  const latest = await getLatestTask(name);

  const state = latest?.Status?.State;
  if (state === "running") return "running";
  if (state === "failed" || state === "rejected") return "failed";
  if (!state) return "unknown";
  return "pending";
}

/**
 * Status.Timestamp is when the task's current task entered its current state
 * (set by Swarm the moment the container started, not when we happen to poll
 * it) - the same value Docker itself uses to compute a container's uptime, so
 * callers get real Docker uptime instead of an approximation based on when
 * our own code last ran. Null unless the task is actually running.
 */
export async function getServiceRunningSince(name: string): Promise<Date | null> {
  const latest = await getLatestTask(name);
  if (latest?.Status?.State !== "running" || !latest.Status.Timestamp) return null;
  return new Date(latest.Status.Timestamp);
}

/**
 * The container ID backing the service's current task - used to tail logs
 * from that one container specifically. A rolling update briefly runs old and
 * new tasks side by side (start-first), and `docker service logs <service>`
 * aggregates output from every task under the service name regardless of
 * which one is "current," so it can't be used to isolate just the new
 * container's output. Scoping to a container ID sidesteps that entirely
 * instead of trying to time-bound it. Filtered to desired-state=running so a
 * task Swarm has already started tearing down (old task, mid-handoff) is
 * never picked even if it briefly still reports State=running.
 */
export async function getRunningContainerId(name: string): Promise<string | null> {
  const latest = await getLatestTask(name, { "desired-state": ["running"] });
  return latest?.Status?.ContainerStatus?.ContainerID ?? null;
}

/**
 * Polls until the service's task actually reaches "running" or "failed" -
 * callers must not report success just because the Swarm API accepted the
 * create/update call, since that only means Swarm scheduled the task, not
 * that the container's own entrypoint survived (a MySQL/Postgres image can
 * accept scheduling and then crash-loop on every retry, which looks identical
 * to success if you don't wait). Returns "pending" on timeout rather than
 * guessing failure - the caller should treat that as "still starting."
 */
export async function waitForServiceRunState(
  name: string,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<ServiceRunState> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await getServiceRunState(name);
    if (state === "running" || state === "failed") return state;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return "pending";
}
