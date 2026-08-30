import "server-only";
import { and, eq } from "drizzle-orm";
import { backupStorageConfigs } from "@openploy/db";
import { decryptSecret, encryptSecret, type EncryptedSecret } from "@openploy/crypto";
import { testS3Connection, type S3ConnectionConfig } from "@openploy/storage";
import type { BackupStorageInput } from "@openploy/shared";
import { db } from "../db";
import { NotFoundError } from "../errors";

// Only forcePathStyle actually varies in a way the DB row needs resolved -
// endpoint/region are always taken directly from user input now (see
// packages/shared/src/backups.ts), never derived/hardcoded per provider.
function resolveForcePathStyle(input: BackupStorageInput): boolean {
  return input.provider === "s3-compatible" ? input.forcePathStyle : false;
}

export async function testBackupStorageConnection(input: BackupStorageInput) {
  const config: S3ConnectionConfig = {
    endpoint: input.endpoint,
    region: input.region,
    bucket: input.bucket,
    forcePathStyle: resolveForcePathStyle(input),
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
  };
  return testS3Connection(config);
}

export async function createBackupStorageConfig(organizationId: string, input: BackupStorageInput) {
  const [row] = await db
    .insert(backupStorageConfigs)
    .values({
      organizationId,
      name: input.name,
      provider: input.provider,
      endpoint: input.endpoint,
      region: input.region,
      bucket: input.bucket,
      pathPrefix: input.pathPrefix,
      forcePathStyle: resolveForcePathStyle(input),
      accessKeyId: input.accessKeyId,
      secretAccessKeyEncrypted: JSON.stringify(encryptSecret(input.secretAccessKey)),
    })
    .returning();
  if (!row) throw new Error("Failed to create backup storage config");
  return row;
}

/** Never selects secretAccessKeyEncrypted - the list view has no reason to touch the blob at all. */
export async function listBackupStorageConfigs(organizationId: string) {
  return db.query.backupStorageConfigs.findMany({
    where: eq(backupStorageConfigs.organizationId, organizationId),
    columns: {
      id: true,
      name: true,
      provider: true,
      endpoint: true,
      region: true,
      bucket: true,
      pathPrefix: true,
      forcePathStyle: true,
      accessKeyId: true,
      lastVerifiedAt: true,
      lastVerifyError: true,
      createdAt: true,
    },
  });
}

async function getOrgScopedBackupStorageConfig(organizationId: string, id: string) {
  const row = await db.query.backupStorageConfigs.findFirst({
    where: and(eq(backupStorageConfigs.id, id), eq(backupStorageConfigs.organizationId, organizationId)),
  });
  if (!row) throw new NotFoundError("Backup storage config not found");
  return row;
}

export async function deleteBackupStorageConfig(organizationId: string, id: string) {
  await getOrgScopedBackupStorageConfig(organizationId, id);
  await db.delete(backupStorageConfigs).where(eq(backupStorageConfigs.id, id));
}

/** Re-verifies an already-saved config using its stored (decrypted) credentials, and persists the result. */
export async function retestBackupStorageConfig(organizationId: string, id: string) {
  const row = await getOrgScopedBackupStorageConfig(organizationId, id);
  const secretAccessKey = decryptSecret(JSON.parse(row.secretAccessKeyEncrypted) as EncryptedSecret);

  const result = await testS3Connection({
    endpoint: row.endpoint,
    region: row.region,
    bucket: row.bucket,
    forcePathStyle: row.forcePathStyle,
    accessKeyId: row.accessKeyId,
    secretAccessKey,
  });

  await db
    .update(backupStorageConfigs)
    .set({
      lastVerifiedAt: result.success ? new Date() : row.lastVerifiedAt,
      lastVerifyError: result.success ? null : (result.error ?? "Unknown error"),
    })
    .where(eq(backupStorageConfigs.id, id));

  return result;
}
