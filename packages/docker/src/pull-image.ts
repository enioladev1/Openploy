import { getDockerClient } from "./client";
import type { LogLineHandler } from "./exec";

interface PullProgressEvent {
  status?: string;
  id?: string;
  progressDetail?: { current?: number; total?: number };
  progress?: string;
}

/**
 * Streams Docker's real pull progress (the same raw event stream `docker
 * pull`/`docker CLI` itself renders as "Pulling fs layer" / "Download
 * complete" / "Pull complete" / "Digest: ..." / "Status: Downloaded newer
 * image for ...") into onLine, one line per status change - not one line per
 * progress tick. A single layer's "Downloading"/"Extracting" status fires
 * dozens of progressDetail-only updates as bytes arrive; collapsing to only
 * the first occurrence of each (id, status) pair is what keeps this from
 * writing thousands of near-duplicate rows into deployment_logs for one pull,
 * while still reproducing exactly what a real `docker pull` prints line-by-line.
 */
export async function pullImageWithProgress(image: string, onLine: LogLineHandler): Promise<void> {
  const docker = getDockerClient();
  const stream = await docker.pull(image);

  const lastStatusById = new Map<string, string>();

  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err: Error | null) => (err ? reject(err) : resolve()),
      (event: PullProgressEvent) => {
        if (!event.status) return;

        const key = event.id ?? "";
        if (lastStatusById.get(key) === event.status) return; // same status as last time - a progress-percentage tick, not a real transition
        lastStatusById.set(key, event.status);

        onLine(event.id ? `${event.id}: ${event.status}` : event.status);
      },
    );
  });
}

/**
 * The exact digest of a just-pulled image, read straight from Docker's own
 * local image store - never re-trust the floating tag string itself between
 * a pull and using it to deploy, since `:latest` can move again in that
 * window. Null if the image genuinely has no digest info (shouldn't happen
 * for anything pulled from a real registry).
 */
export async function getLocalImageDigest(image: string): Promise<string | null> {
  const docker = getDockerClient();
  const info = await docker.getImage(image).inspect();
  const repoDigest = info.RepoDigests?.[0];
  if (!repoDigest) return null;
  return repoDigest.split("@")[1] ?? null;
}

/**
 * Reads a single env var baked into an image at build time (Dockerfile ARG/ENV,
 * e.g. OPENPLOY_VERSION) - deliberately from the image itself, not from a
 * Swarm service's own spec: a Dockerfile ENV is never copied into
 * Spec.TaskTemplate.ContainerSpec.Env, only what's explicitly set via
 * `environment:`/`-e`, so it's invisible to a service-spec inspect no matter
 * how the image was built.
 */
export async function getImageEnvVar(image: string, key: string): Promise<string | null> {
  const docker = getDockerClient();
  const info = await docker.getImage(image).inspect();
  const env: string[] = info.Config?.Env ?? [];
  const entry = env.find((line: string) => line.startsWith(`${key}=`));
  return entry ? entry.slice(key.length + 1) : null;
}
