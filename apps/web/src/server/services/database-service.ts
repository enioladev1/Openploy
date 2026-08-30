import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { databaseServices, deployments, getOrgScopedProject, secrets, services } from "@openploy/db";
import { decryptSecret, encryptSecret, type EncryptedSecret } from "@openploy/crypto";
import { JOB_PROVISION_DATABASE, type CreateDatabaseServiceInput } from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { logAuditEvent } from "../audit";
import { db } from "../db";
import { NotFoundError } from "../errors";

const DEFAULT_PORTS: Record<CreateDatabaseServiceInput["engine"], number> = {
  postgres: 5432,
  mysql: 3306,
  redis: 6379,
  clickhouse: 9000,
  mongodb: 27017,
  mariadb: 3306,
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertSecret(tx: Tx, ownerType: string, ownerId: string, encrypted: EncryptedSecret) {
  const [row] = await tx
    .insert(secrets)
    .values({
      ownerType,
      ownerId,
      cipherText: encrypted.cipherText,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      wrappedDataKey: encrypted.wrappedDataKey,
      wrapIv: encrypted.wrapIv,
      wrapAuthTag: encrypted.wrapAuthTag,
      keyVersion: encrypted.keyVersion,
    })
    .returning();
  if (!row) throw new Error("Failed to store credentials");
  return row;
}

export async function createDatabaseService(organizationId: string, userId: string, input: CreateDatabaseServiceInput) {
  const project = await getOrgScopedProject(db, organizationId, input.projectId);
  if (!project) throw new NotFoundError("Project not found");

  const created = await db.transaction(async (tx) => {
    const [service] = await tx
      .insert(services)
      .values({ projectId: input.projectId, name: input.name, type: "database", createdByUserId: userId })
      .returning();
    if (!service) throw new Error("Failed to create service");

    const secretRow = await insertSecret(tx, "database_service_credentials", service.id, encryptSecret(input.password));
    const rootSecretRow =
      input.engine === "mysql" || input.engine === "mariadb"
        ? await insertSecret(tx, "database_service_root_credentials", service.id, encryptSecret(input.rootPassword))
        : null;

    // Redis has neither a databaseName nor a username - the base row column
    // defaults (databaseName="openploy", username=null) apply untouched for it.
    const identity = input.engine === "redis" ? {} : { databaseName: input.databaseName, username: input.username };

    await tx.insert(databaseServices).values({
      serviceId: service.id,
      engine: input.engine,
      version: input.version,
      internalHost: `db-${service.id}`,
      internalPort: DEFAULT_PORTS[input.engine],
      ...identity,
      credentialsSecretId: secretRow.id,
      rootCredentialsSecretId: rootSecretRow?.id,
      volumeName: `vol-${service.id}`,
    });

    // Provisioning is treated as this service's first deployment - same
    // deployments/deployment_logs pipeline as application/compose services,
    // so a database gets real build/runtime logs and deploy history too,
    // not a separate one-off mechanism.
    const [deployment] = await tx
      .insert(deployments)
      .values({ serviceId: service.id, status: "queued", triggeredBy: "manual", triggeredByUserId: userId, idempotencyKey: randomUUID() })
      .returning();
    if (!deployment) throw new Error("Failed to create deployment");

    return { service, deploymentId: deployment.id };
  });

  await enqueueJob(JOB_PROVISION_DATABASE, { serviceId: created.service.id, deploymentId: created.deploymentId });

  return created.service;
}

export async function getDatabaseServiceDetail(serviceId: string) {
  const detail = await db.query.databaseServices.findFirst({ where: eq(databaseServices.serviceId, serviceId) });
  if (!detail) throw new NotFoundError("Database service configuration not found");
  return detail;
}

async function decryptSecretRow(secretId: string): Promise<string> {
  const secretRow = await db.query.secrets.findFirst({ where: eq(secrets.id, secretId) });
  if (!secretRow) throw new NotFoundError("Credentials not found");
  return decryptSecret({
    keyVersion: secretRow.keyVersion,
    wrappedDataKey: secretRow.wrappedDataKey,
    wrapIv: secretRow.wrapIv,
    wrapAuthTag: secretRow.wrapAuthTag,
    cipherText: secretRow.cipherText,
    iv: secretRow.iv,
    authTag: secretRow.authTag,
  });
}

async function logReveal(organizationId: string, actorUserId: string, serviceId: string, which: "password" | "root_password") {
  await logAuditEvent(db, {
    organizationId,
    actorUserId,
    action: "database.reveal_credential",
    targetType: "database_service",
    targetId: serviceId,
    metadata: { which },
  });
}

/** Only ever decrypted for display on an explicit, audit-logged reveal action. */
export async function revealDatabasePassword(organizationId: string, actorUserId: string, serviceId: string): Promise<string> {
  const detail = await getDatabaseServiceDetail(serviceId);
  await logReveal(organizationId, actorUserId, serviceId, "password");
  return decryptSecretRow(detail.credentialsSecretId);
}

export async function revealDatabaseRootPassword(organizationId: string, actorUserId: string, serviceId: string): Promise<string> {
  const detail = await getDatabaseServiceDetail(serviceId);
  if (!detail.rootCredentialsSecretId) throw new NotFoundError("This database engine has no separate root password");
  await logReveal(organizationId, actorUserId, serviceId, "root_password");
  return decryptSecretRow(detail.rootCredentialsSecretId);
}
