import { eq } from "drizzle-orm";
import { decryptSecret } from "@openploy/crypto";
import { databaseServices, environmentVariables, secrets } from "@openploy/db";
import { buildDatabaseConnectionString, type EnvVarReferenceField } from "@openploy/shared";
import { db } from "./db";

/**
 * The serviceId/field on a row were already validated (same-project, database
 * type) when the link was created in the web app - this just resolves them,
 * trusting that prior check the same way the rest of this function trusts
 * the row's own serviceId.
 */
async function resolveLinkedValue(referencedServiceId: string, field: EnvVarReferenceField): Promise<string> {
  const dbService = await db.query.databaseServices.findFirst({ where: eq(databaseServices.serviceId, referencedServiceId) });
  if (!dbService) throw new Error(`Linked database service not found: ${referencedServiceId}`);

  if (field === "host") return dbService.internalHost;
  if (field === "port") return String(dbService.internalPort);
  if (field === "database_name") return dbService.databaseName;
  if (field === "username") return dbService.username ?? "";

  const secretRow = await db.query.secrets.findFirst({ where: eq(secrets.id, dbService.credentialsSecretId) });
  if (!secretRow) throw new Error(`Credentials not found for linked database service: ${referencedServiceId}`);
  const password = decryptSecret(secretRow);

  if (field === "password") return password;
  return buildDatabaseConnectionString(dbService.engine, dbService.internalHost, dbService.internalPort, dbService.databaseName, dbService.username, password);
}

export interface ServiceEnvVars {
  build: Record<string, string>;
  runtime: Record<string, string>;
  /**
   * Only values explicitly marked isSecret, handed to the redactor. Redacting
   * every env var value regardless of that flag was actively harmful: ordinary
   * Laravel .env settings like FILESYSTEM_DISK=local, CACHE_STORE=file, or
   * DB_CONNECTION=mysql are not secrets, but their values are also substrings
   * of completely unrelated build output (Dockerfile, pdo_mysql, a path under
   * usr-local-bin), and got mangled into unreadable redacted fragments in real
   * build logs as a result. Non-secret values are meant to be visible.
   */
  secretValues: string[];
}

export async function loadDecryptedEnvVars(serviceId: string): Promise<ServiceEnvVars> {
  const rows = await db.query.environmentVariables.findMany({
    where: eq(environmentVariables.serviceId, serviceId),
  });

  const build: Record<string, string> = {};
  const runtime: Record<string, string> = {};
  const secretValues: string[] = [];

  for (const row of rows) {
    const value =
      row.referencesServiceId && row.referencesField
        ? await resolveLinkedValue(row.referencesServiceId, row.referencesField)
        : decryptSecret(JSON.parse(row.valueEncrypted!));
    // Linked values always redacted regardless of isSecret - there's no UI
    // toggle for it, a link is always assumed to expose real credentials.
    if (row.isSecret || row.referencesServiceId) secretValues.push(value);
    if (row.scope === "build") build[row.key] = value;
    else runtime[row.key] = value;
  }

  return { build, runtime, secretValues };
}
