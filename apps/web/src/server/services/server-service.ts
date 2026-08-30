import "server-only";
import { eq } from "drizzle-orm";
import { servers } from "@openploy/db";
import { encryptSecret, generateSshKeypair } from "@openploy/crypto";
import { JOB_JOIN_SERVER, type CreateServerInput } from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { db } from "../db";
import { NotFoundError } from "../errors";

/**
 * Returns the public key so the caller can show the admin what to add to the
 * remote host's authorized_keys before the join job actually runs - the admin
 * completes that step out of band, then confirms to trigger the join attempt.
 */
export async function createServer(organizationId: string, input: CreateServerInput) {
  const keypair = generateSshKeypair();

  const [server] = await db
    .insert(servers)
    .values({
      organizationId,
      name: input.name,
      host: input.host,
      sshPort: input.sshPort,
      sshUsername: input.sshUsername,
      sshPrivateKeyEncrypted: JSON.stringify(encryptSecret(keypair.privateKeyPem)),
      role: "worker",
      status: "pending",
    })
    .returning();
  if (!server) throw new Error("Failed to create server");

  return { server, publicKey: keypair.publicKeyOpenSsh };
}

export async function listServers(organizationId: string) {
  return db.query.servers.findMany({ where: eq(servers.organizationId, organizationId) });
}

/** Called once the admin has added the public key to the remote host's authorized_keys. */
export async function confirmServerAndJoin(organizationId: string, serverId: string) {
  const server = await db.query.servers.findFirst({ where: eq(servers.id, serverId) });
  if (!server || server.organizationId !== organizationId) throw new NotFoundError("Server not found");

  await enqueueJob(JOB_JOIN_SERVER, { serverId });
}
