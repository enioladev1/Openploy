import { eq } from "drizzle-orm";
import { decryptSecret } from "@openploy/crypto";
import { githubApps, githubInstallations } from "@openploy/db";
import { resolveInstallationToken } from "@openploy/github";
import { db } from "./db";

/** Mirrors apps/web's github-service token cache - both call the same shared resolveInstallationToken. */
export async function getInstallationTokenForRow(installationRowId: string): Promise<string> {
  const app = await db.query.githubApps.findFirst();
  if (!app) throw new Error("No GitHub App registered for this instance");

  const installation = await db.query.githubInstallations.findFirst({
    where: eq(githubInstallations.id, installationRowId),
  });
  if (!installation) throw new Error(`GitHub installation not found: ${installationRowId}`);

  const appId = app.appId;
  const privateKeyPem = decryptSecret(JSON.parse(app.privateKeyEncrypted));

  const resolved = await resolveInstallationToken(appId, privateKeyPem, installation.installationId, {
    encryptedToken: installation.installationTokenEncrypted,
    expiresAt: installation.installationTokenExpiresAt,
  });

  if (resolved.refreshed) {
    await db
      .update(githubInstallations)
      .set({
        installationTokenEncrypted: resolved.refreshed.encryptedToken,
        installationTokenExpiresAt: resolved.refreshed.expiresAt,
      })
      .where(eq(githubInstallations.id, installationRowId));
  }

  return resolved.token;
}
