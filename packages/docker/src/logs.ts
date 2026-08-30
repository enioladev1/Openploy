import { PassThrough } from "node:stream";
import { getDockerClient } from "./client";
import { getRunningContainerId } from "./services";

export type ServiceLogLine = { stream: "stdout" | "stderr"; line: string };
export type ServiceLogHandler = (entry: ServiceLogLine) => void;

function lineBuffer(streamName: "stdout" | "stderr", onLine: ServiceLogHandler) {
  const passthrough = new PassThrough();
  let buffered = "";
  passthrough.on("data", (chunk: Buffer) => {
    buffered += chunk.toString("utf8");
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length > 0) onLine({ stream: streamName, line });
    }
  });
  return passthrough;
}

export interface LogStreamHandle {
  stop: () => void;
}

/**
 * Tails the specific container currently backing a Swarm service - not
 * `service.logs()`, which aggregates every task ever run under the service
 * name and mixes an old container's shutdown output with a new one's startup
 * output during a rolling update. Docker multiplexes stdout/stderr into a
 * single byte stream with an 8-byte frame header per chunk; dockerode's
 * modem.demuxStream splits that back into two real streams for us.
 */
export async function streamServiceLogs(
  serviceName: string,
  onLine: ServiceLogHandler,
  options: { since?: number } = {},
): Promise<LogStreamHandle> {
  const docker = getDockerClient();
  const containerId = await getRunningContainerId(serviceName);
  if (!containerId) throw new Error(`No running container for service: ${serviceName}`);

  const container = docker.getContainer(containerId);
  const rawStream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    timestamps: false,
    since: options.since ?? 0,
  });

  const stdout = lineBuffer("stdout", onLine);
  const stderr = lineBuffer("stderr", onLine);
  docker.modem.demuxStream(rawStream as never, stdout, stderr);

  return {
    stop: () => {
      (rawStream as unknown as { destroy: () => void }).destroy();
    },
  };
}
