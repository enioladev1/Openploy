import { runCommand, type LogLineHandler } from "./exec";

export type { LogLineHandler };

export interface DockerfileBuildOptions {
  contextDir: string;
  dockerfileDirectory: string; // relative to contextDir, e.g. "/" or "/apps/api"
  imageTag: string;
  buildArgs: Record<string, string>;
  onLine: LogLineHandler;
  signal?: AbortSignal;
}

/**
 * Shells out to the docker CLI rather than driving BuildKit's gRPC API
 * directly - modern Docker (23+) already runs builds through BuildKit by
 * default, so this gets the same engine with far less code to maintain.
 */
export async function buildDockerfileImage(options: DockerfileBuildOptions): Promise<void> {
  const dockerfilePath = `${options.contextDir}${options.dockerfileDirectory}/Dockerfile`.replace(
    /\/+/g,
    "/",
  );

  const args = [
    "build",
    "--progress=plain",
    "--file",
    dockerfilePath,
    "--tag",
    options.imageTag,
    ...Object.entries(options.buildArgs).flatMap(([key, value]) => ["--build-arg", `${key}=${value}`]),
    options.contextDir,
  ];

  await runCommand("docker", args, options.onLine, options.signal);
}

export interface BuildpacksBuildOptions {
  contextDir: string;
  imageTag: string;
  env: Record<string, string>;
  onLine: LogLineHandler;
  builder?: string;
  signal?: AbortSignal;
}

export async function buildWithHerokuBuildpacks(options: BuildpacksBuildOptions): Promise<void> {
  const args = [
    "build",
    options.imageTag,
    "--path",
    options.contextDir,
    "--builder",
    options.builder ?? "heroku/builder:24",
    "--trust-builder",
    ...Object.entries(options.env).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
  ];

  await runCommand("pack", args, options.onLine, options.signal);
}

export async function pushImage(imageTag: string, onLine: LogLineHandler, signal?: AbortSignal): Promise<void> {
  await runCommand("docker", ["push", imageTag], onLine, signal);
}
