import zlib from "node:zlib";
import { eq } from "drizzle-orm";
import { backupStorageConfigs, databaseBackupSchedules, databaseServices, secrets, services } from "@openploy/db";
import { decryptSecret, type EncryptedSecret } from "@openploy/crypto";
import { execInContainer, execInContainerStream, getFileArchiveFromContainer } from "@openploy/docker";
import { deleteObjects, listObjectsWithPrefix, uploadObjectStream, type S3ConnectionConfig } from "@openploy/storage";
import type { RunDatabaseBackupJob } from "@openploy/shared";
import { db } from "../db";
import { notifyServiceEvent } from "../notifications";
import { extractFirstFileFromTar } from "../tar-extract";

function sanitizeForKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function decryptSecretRow(secretId: string): Promise<string> {
  const row = await db.query.secrets.findFirst({ where: eq(secrets.id, secretId) });
  if (!row) throw new Error("Credentials not found");
  return decryptSecret({
    keyVersion: row.keyVersion,
    wrappedDataKey: row.wrappedDataKey,
    wrapIv: row.wrapIv,
    wrapAuthTag: row.wrapAuthTag,
    cipherText: row.cipherText,
    iv: row.iv,
    authTag: row.authTag,
  });
}

async function markResult(scheduleId: string, status: "success" | "failed", error?: string): Promise<void> {
  await db
    .update(databaseBackupSchedules)
    .set({
      lastRunAt: new Date(),
      lastRunStatus: status,
      lastRunError: status === "failed" ? (error ?? "Unknown error").slice(0, 4000) : null,
    })
    .where(eq(databaseBackupSchedules.id, scheduleId));
}

/** Triggers a BGSAVE and polls until it finishes - REDISCLI_AUTH (an env var, not a CLI arg) keeps the password out of the container's own process list. */
async function runRedisBgsave(serviceName: string, password: string): Promise<void> {
  const authEnv = [`REDISCLI_AUTH=${password}`];
  await execInContainer(serviceName, { cmd: ["redis-cli", "BGSAVE"], env: authEnv });

  const maxAttempts = 30;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const info = await execInContainer(serviceName, { cmd: ["redis-cli", "INFO", "persistence"], env: authEnv });
    if (/rdb_bgsave_in_progress:0/.test(info)) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Timed out waiting for Redis BGSAVE to complete");
}

async function dumpAndUpload(
  engine: "postgres" | "mysql" | "mariadb",
  internalHost: string,
  username: string,
  password: string,
  databaseName: string,
  s3Config: S3ConnectionConfig,
  key: string,
): Promise<void> {
  const { stdout, waitForExit } =
    engine === "postgres"
      ? await execInContainerStream(internalHost, {
          cmd: ["pg_dump", "-U", username, "-d", databaseName],
          env: [`PGPASSWORD=${password}`],
        })
      : await execInContainerStream(internalHost, {
          // mariadb-dump is the current canonical binary name on MariaDB
          // images; mysqldump remains the right name on actual MySQL images.
          cmd: [engine === "mariadb" ? "mariadb-dump" : "mysqldump", `-u${username}`, "--single-transaction", databaseName],
          env: [`MYSQL_PWD=${password}`],
        });

  try {
    await Promise.all([waitForExit(), uploadObjectStream(s3Config, key, stdout.pipe(zlib.createGzip()))]);
  } catch (err) {
    await deleteObjects(s3Config, [key]).catch(() => undefined); // best-effort cleanup of a partial/failed upload
    throw err;
  }
}

/** mongodump's own --gzip already compresses the archive stream - piping through zlib again would double-gzip it. */
async function dumpMongoAndUpload(
  internalHost: string,
  username: string,
  password: string,
  databaseName: string,
  s3Config: S3ConnectionConfig,
  key: string,
): Promise<void> {
  const { stdout, waitForExit } = await execInContainerStream(internalHost, {
    cmd: [
      "mongodump",
      `--username=${username}`,
      `--password=${password}`,
      "--authenticationDatabase=admin",
      `--db=${databaseName}`,
      "--archive",
      "--gzip",
    ],
    env: [],
  });

  try {
    await Promise.all([waitForExit(), uploadObjectStream(s3Config, key, stdout)]);
  } catch (err) {
    await deleteObjects(s3Config, [key]).catch(() => undefined);
    throw err;
  }
}

// A backup spans several slow, independently-failing steps (exec into the
// container, dump, stream to S3) and previously logged nothing at all, so a
// hang was indistinguishable from a crash from a silent success. Each step
// announces itself to make the failing one obvious in `docker service logs`.
function log(scheduleId: string, message: string): void {
  console.log(`[run-database-backup] ${scheduleId}: ${message}`);
}

export async function processRunDatabaseBackupJob(job: RunDatabaseBackupJob): Promise<void> {
  const schedule = await db.query.databaseBackupSchedules.findFirst({
    where: eq(databaseBackupSchedules.id, job.scheduleId),
  });
  if (!schedule) {
    console.error(`[run-database-backup] ${job.scheduleId}: schedule no longer exists - skipping`);
    return; // deleted since being enqueued - nothing to do
  }
  log(job.scheduleId, "starting");

  try {
    const [service, dbService, storageConfig] = await Promise.all([
      db.query.services.findFirst({ where: eq(services.id, schedule.serviceId) }),
      db.query.databaseServices.findFirst({ where: eq(databaseServices.serviceId, schedule.serviceId) }),
      db.query.backupStorageConfigs.findFirst({ where: eq(backupStorageConfigs.id, schedule.backupStorageConfigId) }),
    ]);
    if (!service || !dbService || !storageConfig) throw new Error("Service or backup storage config no longer exists");

    const password = await decryptSecretRow(dbService.credentialsSecretId);
    const storageSecretAccessKey = decryptSecret(JSON.parse(storageConfig.secretAccessKeyEncrypted) as EncryptedSecret);

    const s3Config: S3ConnectionConfig = {
      endpoint: storageConfig.endpoint,
      region: storageConfig.region,
      bucket: storageConfig.bucket,
      forcePathStyle: storageConfig.forcePathStyle,
      accessKeyId: storageConfig.accessKeyId,
      secretAccessKey: storageSecretAccessKey,
    };

    const folder = [storageConfig.pathPrefix, `openploy-${sanitizeForKey(service.name)}`].filter(Boolean).join("/");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    log(job.scheduleId, `dumping ${dbService.engine} from "${dbService.internalHost}" to ${storageConfig.endpoint}/${storageConfig.bucket}`);

    if (dbService.engine === "postgres" || dbService.engine === "mysql" || dbService.engine === "mariadb") {
      if (!dbService.username) throw new Error(`${dbService.engine} database is missing its username`);
      const key = `${folder}/${timestamp}.sql.gz`;
      await dumpAndUpload(dbService.engine, dbService.internalHost, dbService.username, password, dbService.databaseName, s3Config, key);
    } else if (dbService.engine === "redis") {
      const key = `${folder}/${timestamp}.rdb`;
      await runRedisBgsave(dbService.internalHost, password);
      const archive = await getFileArchiveFromContainer(dbService.internalHost, "/data/dump.rdb");
      const fileStream = await extractFirstFileFromTar(archive);
      await uploadObjectStream(s3Config, key, fileStream);
    } else if (dbService.engine === "mongodb") {
      if (!dbService.username) throw new Error("mongodb database is missing its username");
      const key = `${folder}/${timestamp}.archive.gz`;
      await dumpMongoAndUpload(dbService.internalHost, dbService.username, password, dbService.databaseName, s3Config, key);
    } else {
      throw new Error(`Scheduled backups aren't supported for ${dbService.engine} yet`);
    }

    log(job.scheduleId, "upload complete");

    if (schedule.retentionCount) {
      const objects = await listObjectsWithPrefix(s3Config, `${folder}/`);
      const oldestFirst = [...objects].sort((a, b) => (a.lastModified?.getTime() ?? 0) - (b.lastModified?.getTime() ?? 0));
      const excess = oldestFirst.slice(0, Math.max(0, oldestFirst.length - schedule.retentionCount));
      await deleteObjects(s3Config, excess.map((object) => object.key));
    }

    await markResult(job.scheduleId, "success");
    log(job.scheduleId, "success");
    await notifyServiceEvent(schedule.serviceId, "backup_success");
  } catch (err) {
    console.error(`[run-database-backup] ${job.scheduleId}: failed:`, err);
    await markResult(job.scheduleId, "failed", err instanceof Error ? err.message : String(err));
    await notifyServiceEvent(schedule.serviceId, "backup_failed");
  }
}
