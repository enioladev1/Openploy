import { signAppJwt } from "./jwt";
import { fetchWithRetry } from "./retry";

const GITHUB_API_BASE = "https://api.github.com";

export interface InstallationToken {
  token: string;
  expiresAt: Date;
}

/** Short-lived (~1h), scoped exactly to the repos granted at install time. Never a long-lived PAT. */
export async function getInstallationToken(
  appId: string,
  privateKeyPem: string,
  installationId: string,
): Promise<InstallationToken> {
  const appJwt = signAppJwt(appId, privateKeyPem);

  const response = await fetchWithRetry(`${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appJwt}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to mint installation token: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as { token: string; expires_at: string };
  return { token: body.token, expiresAt: new Date(body.expires_at) };
}

export interface InstallationInfo {
  accountLogin: string;
  accountType: "User" | "Organization";
}

export async function getInstallationInfo(
  appId: string,
  privateKeyPem: string,
  installationId: string,
): Promise<InstallationInfo> {
  const appJwt = signAppJwt(appId, privateKeyPem);

  const response = await fetchWithRetry(`${GITHUB_API_BASE}/app/installations/${installationId}`, {
    headers: {
      Authorization: `Bearer ${appJwt}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch installation info: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as { account: { login: string; type: "User" | "Organization" } };
  return { accountLogin: body.account.login, accountType: body.account.type };
}
