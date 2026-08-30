import { decryptSecret, encryptSecret } from "@openploy/crypto";
import { getInstallationToken } from "./installation-token";

export interface CachedTokenState {
  encryptedToken: string | null; // JSON.stringify(EncryptedSecret) or null
  expiresAt: Date | null;
}

export interface ResolvedToken {
  token: string;
  /** Present only when a refresh happened - the caller (web or agent) is responsible for persisting this. */
  refreshed?: { encryptedToken: string; expiresAt: Date };
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Shared by apps/web (repo/branch listing) and apps/agent (deployment source
 * fetch) so the "check expiry, refresh, cache" logic exists in exactly one place.
 */
export async function resolveInstallationToken(
  appId: string,
  privateKeyPem: string,
  ghInstallationId: string,
  cached: CachedTokenState,
): Promise<ResolvedToken> {
  const needsRefresh =
    !cached.encryptedToken || !cached.expiresAt || cached.expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS;

  if (!needsRefresh && cached.encryptedToken) {
    return { token: decryptSecret(JSON.parse(cached.encryptedToken)) };
  }

  const fresh = await getInstallationToken(appId, privateKeyPem, ghInstallationId);
  return {
    token: fresh.token,
    refreshed: { encryptedToken: JSON.stringify(encryptSecret(fresh.token)), expiresAt: fresh.expiresAt },
  };
}
