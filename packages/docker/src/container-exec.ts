import { PassThrough, type Readable } from "node:stream";
import { getDockerClient } from "./client";

/**
 * Resolves a Swarm service name to its actually-running container ID -
 * queried from Docker's own live container list (filtered by the
 * "com.docker.swarm.service.name" label every Swarm task container carries),
 * not from Swarm's task history. Deliberately NOT `docker.listTasks(...)` +
 * `Status.State === "running"`: a task whose container refused to die on a
 * stop/kill request (a slow shutdown handler, a stuck signal) gets marked
 * "Failed" in Swarm's own bookkeeping even though the container itself is
 * still alive and perfectly reachable - exactly the case that broke the
 * first version of this function against a real database container.
 */
async function findRunningContainerId(serviceName: string): Promise<string> {
  const docker = getDockerClient();
  const containers = await docker.listContainers({
    filters: JSON.stringify({ label: [`com.docker.swarm.service.name=${serviceName}`], status: ["running"] }),
  });
  const containerId = containers[0]?.Id;
  if (!containerId) {
    throw new Error(`No running container found for service "${serviceName}"`);
  }
  return containerId;
}

export interface ContainerExecOptions {
  cmd: string[];
  /** "KEY=value" pairs, scoped to this one exec - never the container's own persistent env. */
  env?: string[];
}

export interface ContainerExecStream {
  stdout: Readable;
  /** Await AFTER fully consuming stdout - Docker doesn't report the real exit code until the process has actually finished. Throws (with the captured stderr) on a non-zero exit. */
  waitForExit: () => Promise<void>;
}

/**
 * Runs a command inside a service's running container and returns its
 * stdout as a stream - for pg_dump/mysqldump, whose output can be many
 * gigabytes and must never be fully buffered in memory. Never requests a
 * TTY: without one, Docker multiplexes stdout/stderr with an 8-byte frame
 * header per chunk, which dockerode's own demuxStream (the same one
 * logs.ts already uses) is needed to split back apart.
 */
export async function execInContainerStream(serviceName: string, options: ContainerExecOptions): Promise<ContainerExecStream> {
  const docker = getDockerClient();
  const containerId = await findRunningContainerId(serviceName);
  const container = docker.getContainer(containerId);

  const exec = await container.exec({
    Cmd: options.cmd,
    Env: options.env,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });

  const rawStream = await exec.start({ hijack: true, stdin: false });

  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(rawStream, stdout, stderr);

  const stderrChunks: Buffer[] = [];
  stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  // demuxStream only forwards 'data' - it never ends the streams it writes
  // into. Without closing them here, anything waiting for stdout's EOF (the
  // S3 upload of a pg_dump, say) waits forever even though the command has
  // long since exited. Attached now rather than inside waitForExit so a
  // stream that ends before waitForExit is called still settles it.
  const finished = new Promise<void>((resolve, reject) => {
    rawStream.on("end", () => {
      stdout.end();
      stderr.end();
      resolve();
    });
    rawStream.on("error", (err: Error) => {
      stdout.destroy(err);
      stderr.destroy(err);
      reject(err);
    });
  });
  finished.catch(() => undefined); // a rejection is surfaced via waitForExit, not as an unhandled rejection

  const waitForExit = async () => {
    await finished;
    const info = await exec.inspect();
    if ((info.ExitCode ?? 1) !== 0) {
      throw new Error(`Command exited with code ${info.ExitCode}: ${Buffer.concat(stderrChunks).toString("utf8").slice(-2000)}`);
    }
  };

  return { stdout, waitForExit };
}

/** Buffered convenience wrapper for short-lived commands (e.g. "redis-cli BGSAVE") whose output is small enough to hold in memory. */
export async function execInContainer(serviceName: string, options: ContainerExecOptions): Promise<string> {
  const { stdout, waitForExit } = await execInContainerStream(serviceName, options);
  const chunks: Buffer[] = [];
  stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  await waitForExit();
  return Buffer.concat(chunks).toString("utf8");
}

/** A tar stream containing just the file at containerPath - callers extract the single entry (e.g. with tar-stream). */
export async function getFileArchiveFromContainer(serviceName: string, containerPath: string): Promise<NodeJS.ReadableStream> {
  const docker = getDockerClient();
  const containerId = await findRunningContainerId(serviceName);
  const container = docker.getContainer(containerId);
  return container.getArchive({ path: containerPath });
}
