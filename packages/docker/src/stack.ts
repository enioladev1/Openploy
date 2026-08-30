import { runCommand, type LogLineHandler } from "./exec";

/**
 * Shells out to `docker stack deploy` rather than reimplementing compose-to-
 * Swarm-service translation - Docker already owns that conversion correctly.
 * composeFilePath must always be a platform-generated path (see packages/compose
 * + apps/agent's stack workspace layout), never anything derived from user input.
 */
export async function deployStack(
  stackName: string,
  composeFilePath: string,
  onLine: LogLineHandler,
  signal?: AbortSignal,
): Promise<void> {
  await runCommand(
    "docker",
    ["stack", "deploy", "--compose-file", composeFilePath, "--with-registry-auth", stackName],
    onLine,
    signal,
  );
}

export async function removeStack(stackName: string, onLine: LogLineHandler): Promise<void> {
  await runCommand("docker", ["stack", "rm", stackName], onLine);
}
