import { and, eq } from "drizzle-orm";
import { databaseServices, deployments, secrets, services } from "@openploy/db";
import { decryptSecret } from "@openploy/crypto";
import { createOrUpdateService, type ContainerServiceSpec } from "@openploy/docker";
import type { ProvisionDatabaseJob } from "@openploy/shared";
import { db } from "../db";
import { isDeploymentCanceled } from "../deployment-cancellation";
import { createLogWriter, type LogWriter } from "../log-writer";
import { buildRedactor } from "../redact";
import { finalizeServiceRunState, resolveRuntimeStatusChangedAt } from "../service-lifecycle";

interface DatabaseCredentials {
  databaseName: string;
  username: string | null;
  password: string;
  rootPassword: string | null;
}

export function buildSpec(
  engine: "postgres" | "mysql" | "redis" | "clickhouse" | "mongodb" | "mariadb",
  version: string,
  internalHost: string,
  volumeName: string,
  creds: DatabaseCredentials,
  resources: { cpuLimit: number; memoryLimitMb: number },
): ContainerServiceSpec {
  // Single-replica stateful services must stop the old instance before
  // starting a new one - see ContainerServiceSpec.updateOrder's docstring.
  const base = { name: internalHost, networks: ["platform_internal"], resources, updateOrder: "stop-first" as const };

  switch (engine) {
    case "postgres":
      // POSTGRES_USER is created as a superuser by this image - there is no
      // separate "root" concept to expose here, unlike MySQL.
      //
      // Mount target depends on major version: 18+ changed the image to store
      // data in a pg_ctlcluster-style, version-named subdirectory (to support
      // in-place pg_upgrade --link) and refuses to start if it instead finds
      // an old-style mount directly at .../data - it exits immediately with
      // "there appears to be PostgreSQL data in: ... (unused mount/volume)".
      // See https://github.com/docker-library/postgres/pull/1259.
      return {
        ...base,
        image: `postgres:${version}`,
        env: {
          POSTGRES_USER: creds.username ?? "openploy",
          POSTGRES_PASSWORD: creds.password,
          POSTGRES_DB: creds.databaseName,
        },
        mounts: [{ volumeName, targetPath: Number(version) >= 18 ? "/var/lib/postgresql" : "/var/lib/postgresql/data" }],
      };
    case "mysql":
      // MYSQL_USER/MYSQL_PASSWORD create a real non-root app user scoped to
      // MYSQL_DATABASE; MYSQL_ROOT_PASSWORD is a genuinely separate credential.
      return {
        ...base,
        image: `mysql:${version}`,
        env: {
          MYSQL_DATABASE: creds.databaseName,
          MYSQL_USER: creds.username ?? "openploy",
          MYSQL_PASSWORD: creds.password,
          MYSQL_ROOT_PASSWORD: creds.rootPassword ?? creds.password,
        },
        mounts: [{ volumeName, targetPath: "/var/lib/mysql" }],
      };
    case "redis":
      // Redis has no user/database concept and no env-var-based auth; the
      // password is passed as a launch argument constructed server-side only,
      // never rendered into any log.
      return {
        ...base,
        image: `redis:${version}`,
        env: {},
        command: ["redis-server", "--requirepass", creds.password],
        mounts: [{ volumeName, targetPath: "/data" }],
      };
    case "clickhouse":
      return {
        ...base,
        image: `clickhouse/clickhouse-server:${version}`,
        env: {
          CLICKHOUSE_DB: creds.databaseName,
          CLICKHOUSE_USER: creds.username ?? "openploy",
          CLICKHOUSE_PASSWORD: creds.password,
        },
        mounts: [{ volumeName, targetPath: "/var/lib/clickhouse" }],
      };
    case "mariadb":
      // Same env var contract as mysql (MARIADB_* is the current canonical
      // naming for the official image; legacy MYSQL_* names are also
      // accepted but MARIADB_* is what the image's own docs lead with now).
      return {
        ...base,
        image: `mariadb:${version}`,
        env: {
          MARIADB_DATABASE: creds.databaseName,
          MARIADB_USER: creds.username ?? "openploy",
          MARIADB_PASSWORD: creds.password,
          MARIADB_ROOT_PASSWORD: creds.rootPassword ?? creds.password,
        },
        mounts: [{ volumeName, targetPath: "/var/lib/mysql" }],
      };
    case "mongodb":
      // MONGO_INITDB_ROOT_USERNAME/PASSWORD create a single root-level admin
      // user (Mongo's auth model has no per-database user creation via env
      // vars the way Postgres/MySQL do) - MONGO_INITDB_DATABASE only picks
      // which database init scripts would run against, it doesn't scope auth.
      return {
        ...base,
        image: `mongo:${version}`,
        env: {
          MONGO_INITDB_DATABASE: creds.databaseName,
          MONGO_INITDB_ROOT_USERNAME: creds.username ?? "openploy",
          MONGO_INITDB_ROOT_PASSWORD: creds.password,
        },
        mounts: [{ volumeName, targetPath: "/data/db" }],
      };
  }
}

async function markFailed(logWriter: LogWriter, deploymentId: string, serviceId: string, reason: string): Promise<void> {
  await logWriter.write("build", `Provisioning failed: ${reason}`);
  await db
    .update(deployments)
    .set({ status: "failed", failureReason: reason.slice(0, 4000), finishedAt: new Date() })
    .where(eq(deployments.id, deploymentId));
  await db
    .update(services)
    .set({ runtimeStatus: "failed", runtimeStatusChangedAt: new Date() })
    .where(eq(services.id, serviceId));
}

export async function processProvisionDatabaseJob(job: ProvisionDatabaseJob): Promise<void> {
  const deployment = await db.query.deployments.findFirst({ where: eq(deployments.id, job.deploymentId) });
  if (!deployment) throw new Error(`Deployment not found: ${job.deploymentId}`);

  // Atomic claim - see deploy-application.ts's identical guard for why: a
  // pg-boss redelivery of a job that's still legitimately running past its
  // expiry must never be allowed to start a second concurrent provision.
  const [claimed] = await db
    .update(deployments)
    .set({ status: "building", startedAt: new Date() })
    .where(and(eq(deployments.id, deployment.id), eq(deployments.status, "queued")))
    .returning();
  if (!claimed) {
    console.log(`[provision-database] deployment ${deployment.id} already claimed (status was "${deployment.status}") - skipping duplicate delivery`);
    return;
  }

  const dbService = await db.query.databaseServices.findFirst({
    where: eq(databaseServices.serviceId, job.serviceId),
  });
  if (!dbService) {
    throw new Error(`Database service configuration not found: ${job.serviceId}`);
  }

  const secretRow = await db.query.secrets.findFirst({ where: eq(secrets.id, dbService.credentialsSecretId) });
  if (!secretRow) throw new Error(`Credentials secret not found for service: ${job.serviceId}`);
  const password = decryptSecret(secretRow);

  let rootPassword: string | null = null;
  if (dbService.rootCredentialsSecretId) {
    const rootSecretRow = await db.query.secrets.findFirst({
      where: eq(secrets.id, dbService.rootCredentialsSecretId),
    });
    if (!rootSecretRow) throw new Error(`Root credentials secret not found for service: ${job.serviceId}`);
    rootPassword = decryptSecret(rootSecretRow);
  }

  const redact = buildRedactor([password, rootPassword].filter((v): v is string => v !== null));
  const logWriter = createLogWriter(deployment.id, redact);
  const onLine = (line: string) => {
    logWriter.write("build", line).catch((err) => console.error("[provision-database] failed to write log line:", err));
  };

  try {
    await logWriter.write("build", `Provisioning ${dbService.engine}:${dbService.version} as "${dbService.internalHost}"`);

    const spec = buildSpec(
      dbService.engine,
      dbService.version,
      dbService.internalHost,
      dbService.volumeName,
      { databaseName: dbService.databaseName, username: dbService.username, password, rootPassword },
      { cpuLimit: dbService.cpuLimit, memoryLimitMb: dbService.memoryLimitMb },
    );

    if (await isDeploymentCanceled(deployment.id)) throw new Error("Canceled");
    await db.update(deployments).set({ status: "deploying" }).where(eq(deployments.id, deployment.id));
    await createOrUpdateService(spec, onLine);

    // Waits for the task to actually reach running/failed rather than trusting
    // that the Swarm API accepting the create call means the container survived
    // its entrypoint, and starts tailing the container's own output either way -
    // see finalizeServiceRunState's docstring for why both of those matter.
    const finalState = await finalizeServiceRunState(dbService.internalHost, job.serviceId, deployment.id, redact);
    const runtimeStatusChangedAt = await resolveRuntimeStatusChangedAt(dbService.internalHost, finalState);

    await db.update(deployments).set({ status: "success", finishedAt: new Date() }).where(eq(deployments.id, deployment.id));
    await db
      .update(services)
      .set({ currentDeploymentId: deployment.id, runtimeStatus: finalState, runtimeStatusChangedAt })
      .where(eq(services.id, job.serviceId));
  } catch (err) {
    // See deploy-application.ts's identical guard - deployments.cancel
    // already set status to "canceled", markFailed would overwrite it.
    if (await isDeploymentCanceled(deployment.id)) {
      await logWriter.write("build", "Deployment canceled");
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(logWriter, deployment.id, job.serviceId, message);
  }
}
