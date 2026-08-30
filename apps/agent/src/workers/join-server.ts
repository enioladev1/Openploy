import { eq } from "drizzle-orm";
import { decryptSecret } from "@openploy/crypto";
import { servers } from "@openploy/db";
import { getSwarmJoinInfo, runSwarmJoin } from "@openploy/docker";
import type { JoinServerJob } from "@openploy/shared";
import { db } from "../db";

export async function processJoinServerJob(job: JoinServerJob): Promise<void> {
  const server = await db.query.servers.findFirst({ where: eq(servers.id, job.serverId) });
  if (!server) throw new Error(`Server not found: ${job.serverId}`);

  await db.update(servers).set({ status: "connecting" }).where(eq(servers.id, server.id));

  try {
    const { managerAddr, workerJoinToken } = await getSwarmJoinInfo();
    const privateKeyPem = decryptSecret(JSON.parse(server.sshPrivateKeyEncrypted));

    const result = await runSwarmJoin(
      {
        host: server.host,
        port: server.sshPort,
        username: server.sshUsername,
        privateKeyPem,
        ...(server.sshHostKeyFingerprint ? { expectedHostKeyFingerprint: server.sshHostKeyFingerprint } : {}),
      },
      managerAddr,
      workerJoinToken,
    );

    await db
      .update(servers)
      .set({ status: "active", sshHostKeyFingerprint: result.hostKeyFingerprint })
      .where(eq(servers.id, server.id));
  } catch (err) {
    await db.update(servers).set({ status: "unreachable" }).where(eq(servers.id, server.id));
    throw err; // let pg-boss retry per its normal retry policy
  }
}
