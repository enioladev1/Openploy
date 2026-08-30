import { getDockerClient } from "./client";

export interface SwarmJoinInfo {
  managerAddr: string;
  workerJoinToken: string;
}

/**
 * The join token always comes from this manager's own Swarm state, never from
 * anything a client supplies - a "server" the admin adds only ever receives a
 * value we generated ourselves.
 */
export async function getSwarmJoinInfo(): Promise<SwarmJoinInfo> {
  const docker = getDockerClient();
  const [swarm, info] = await Promise.all([docker.swarmInspect(), docker.info()]);

  const nodeAddr = (info as unknown as { Swarm?: { NodeAddr?: string } }).Swarm?.NodeAddr;
  if (!nodeAddr) throw new Error("This host is not a Swarm manager");

  return {
    managerAddr: `${nodeAddr}:2377`,
    workerJoinToken: (swarm as unknown as { JoinTokens: { Worker: string } }).JoinTokens.Worker,
  };
}

export async function ensureSwarmInitialized(advertiseAddr: string): Promise<void> {
  const docker = getDockerClient();
  try {
    await docker.swarmInspect();
  } catch {
    await docker.swarmInit({ AdvertiseAddr: advertiseAddr, ListenAddr: "0.0.0.0:2377" } as never);
  }
}
