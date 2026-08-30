import "server-only";
import { and, eq } from "drizzle-orm";
import {
  buildAppManifest,
  exchangeManifestCode,
  getFileContent,
  getInstallationInfo,
  listBranches as ghListBranches,
  listInstallationRepositories,
  resolveInstallationToken,
} from "@openploy/github";
import { decryptSecret, encryptSecret } from "@openploy/crypto";
import { githubApps, githubInstallations } from "@openploy/db";
import { getEffectiveBaseUrl } from "../base-url";
import { db } from "../db";
import { ForbiddenError, NotFoundError } from "../errors";

export async function buildManifestForSetup() {
  return buildAppManifest({ baseUrl: await getEffectiveBaseUrl(), name: "Openploy" });
}

/**
 * Mirrors the org-bootstrap pattern in auth-service: only one GitHub App
 * registration is supported per instance (matches the "one instance" model),
 * so setup is a one-shot action rather than something reconfigurable per org.
 */
export async function completeGithubAppSetup(manifestCode: string) {
  const existing = await db.query.githubApps.findFirst();
  if (existing) {
    throw new ForbiddenError("A GitHub App is already registered for this instance");
  }

  const created = await exchangeManifestCode(manifestCode);

  const [row] = await db
    .insert(githubApps)
    .values({
      appId: String(created.id),
      appSlug: created.slug,
      privateKeyEncrypted: JSON.stringify(encryptSecret(created.pem)),
      webhookSecretEncrypted: JSON.stringify(encryptSecret(created.webhookSecret)),
      clientId: created.clientId,
      clientSecretEncrypted: JSON.stringify(encryptSecret(created.clientSecret)),
    })
    .returning();

  return row;
}

export async function getGithubApp() {
  return db.query.githubApps.findFirst();
}

interface DecryptedGithubApp {
  appId: string;
  appSlug: string;
  privateKeyPem: string;
  webhookSecret: string;
}

async function getDecryptedGithubApp(): Promise<DecryptedGithubApp> {
  const app = await getGithubApp();
  if (!app) throw new NotFoundError("No GitHub App is registered for this instance yet");

  return {
    appId: app.appId,
    appSlug: app.appSlug,
    privateKeyPem: decryptSecret(JSON.parse(app.privateKeyEncrypted)),
    webhookSecret: decryptSecret(JSON.parse(app.webhookSecretEncrypted)),
  };
}

export async function buildInstallUrl(state: string): Promise<string> {
  const app = await getDecryptedGithubApp();
  return `https://github.com/apps/${app.appSlug}/installations/new?state=${encodeURIComponent(state)}`;
}

/**
 * Idempotent: GitHub fires the setup_url redirect again on every "update"
 * action (e.g. changing which repos are shared), not just the first install,
 * so a second call for the same installationId must succeed, not violate the
 * unique constraint on installationId.
 */
export async function completeInstallation(
  organizationId: string,
  userId: string,
  installationId: string,
) {
  const app = await getDecryptedGithubApp();
  const info = await getInstallationInfo(app.appId, app.privateKeyPem, installationId);

  const existing = await db.query.githubInstallations.findFirst({
    where: eq(githubInstallations.installationId, installationId),
  });
  if (existing) {
    if (existing.organizationId !== organizationId) {
      throw new ForbiddenError("This GitHub installation is already connected to a different organization");
    }
    const [updated] = await db
      .update(githubInstallations)
      .set({ accountLogin: info.accountLogin, accountType: info.accountType })
      .where(eq(githubInstallations.id, existing.id))
      .returning();
    return updated;
  }

  const [row] = await db
    .insert(githubInstallations)
    .values({
      organizationId,
      installationId,
      accountLogin: info.accountLogin,
      accountType: info.accountType,
      connectedByUserId: userId,
    })
    .returning();

  return row;
}

export async function listInstallations(organizationId: string) {
  return db.query.githubInstallations.findMany({
    where: eq(githubInstallations.organizationId, organizationId),
  });
}

async function getOrgScopedInstallation(organizationId: string, installationRowId: string) {
  const row = await db.query.githubInstallations.findFirst({
    where: and(
      eq(githubInstallations.id, installationRowId),
      eq(githubInstallations.organizationId, organizationId),
    ),
  });
  if (!row) throw new NotFoundError("GitHub installation not found");
  return row;
}

/** Refreshes and persists the cached installation token if it's missing or within 5 minutes of expiry. */
async function getValidInstallationToken(installationRowId: string, ghInstallationId: string) {
  const app = await getDecryptedGithubApp();
  const row = await db.query.githubInstallations.findFirst({
    where: eq(githubInstallations.id, installationRowId),
  });
  if (!row) throw new NotFoundError("GitHub installation not found");

  const resolved = await resolveInstallationToken(app.appId, app.privateKeyPem, ghInstallationId, {
    encryptedToken: row.installationTokenEncrypted,
    expiresAt: row.installationTokenExpiresAt,
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

export async function listRepos(organizationId: string, installationRowId: string) {
  const row = await getOrgScopedInstallation(organizationId, installationRowId);
  const token = await getValidInstallationToken(row.id, row.installationId);
  return listInstallationRepositories(token);
}

export async function listRepoBranches(
  organizationId: string,
  installationRowId: string,
  owner: string,
  repo: string,
) {
  const row = await getOrgScopedInstallation(organizationId, installationRowId);
  const token = await getValidInstallationToken(row.id, row.installationId);
  return ghListBranches(token, owner, repo);
}

export async function getRepoFileContent(
  organizationId: string,
  installationRowId: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string> {
  const row = await getOrgScopedInstallation(organizationId, installationRowId);
  const token = await getValidInstallationToken(row.id, row.installationId);
  return getFileContent(token, owner, repo, path, ref);
}

export async function getWebhookSecret(): Promise<string> {
  const app = await getDecryptedGithubApp();
  return app.webhookSecret;
}

export async function findInstallationByGithubId(ghInstallationId: string) {
  return db.query.githubInstallations.findFirst({
    where: eq(githubInstallations.installationId, ghInstallationId),
  });
}
