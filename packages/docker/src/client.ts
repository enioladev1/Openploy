import Dockerode from "dockerode";

let cachedClient: Dockerode | null = null;

/**
 * The only place in the whole platform that touches /var/run/docker.sock.
 * This package is imported exclusively by apps/agent - never by apps/web,
 * which is the internet-facing process and must never hold Docker-root-equivalent access.
 */
export function getDockerClient(): Dockerode {
  if (cachedClient) return cachedClient;
  cachedClient = new Dockerode({ socketPath: process.env.DOCKER_SOCKET_PATH ?? "/var/run/docker.sock" });
  return cachedClient;
}
