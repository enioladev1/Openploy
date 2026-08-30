import { eq } from "drizzle-orm";
import { databaseServices, secrets } from "@openploy/db";
import { decryptSecret } from "@openploy/crypto";
import { db } from "./db";
import { loadDecryptedEnvVars } from "./env-vars";

/**
 * Known secret values to redact from a lifecycle action's log output
 * (reload/start container logs can echo real values same as a fresh
 * deploy's can). Application/compose secrets live in environment_variables;
 * a database's credentials live in the separate secrets table instead, same
 * source provision-database.ts itself redacts against.
 */
export async function getKnownSecretValues(serviceId: string, type: "application" | "database" | "compose"): Promise<string[]> {
  if (type === "database") {
    const dbService = await db.query.databaseServices.findFirst({ where: eq(databaseServices.serviceId, serviceId) });
    if (!dbService) return [];

    const values: string[] = [];
    const secretRow = await db.query.secrets.findFirst({ where: eq(secrets.id, dbService.credentialsSecretId) });
    if (secretRow) values.push(decryptSecret(secretRow));

    if (dbService.rootCredentialsSecretId) {
      const rootSecretRow = await db.query.secrets.findFirst({ where: eq(secrets.id, dbService.rootCredentialsSecretId) });
      if (rootSecretRow) values.push(decryptSecret(rootSecretRow));
    }

    return values;
  }

  const envVars = await loadDecryptedEnvVars(serviceId);
  return envVars.secretValues;
}
