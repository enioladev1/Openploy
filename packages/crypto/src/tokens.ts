import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const SESSION_TOKEN_BYTES = 32;

/** Raw token goes in the cookie; only its hash is ever persisted, so a DB read alone can't be replayed as a session. */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function safeCompareHash(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Short random codes for things like recovery codes; encoded to avoid ambiguous chars. */
export function generateRecoveryCode(): string {
  return randomBytes(6).toString("base64url").replace(/[-_]/g, "").slice(0, 10).toUpperCase();
}

/** High-entropy generated secrets for auto-provisioned database credentials, etc. */
export function generateStrongSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
