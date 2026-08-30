import { createSign } from "node:crypto";

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * GitHub App auth JWT (RS256), signed with the app's own private key. Kept
 * to a short lifetime per GitHub's guidance (max 10 minutes); used only to
 * mint installation access tokens, never sent anywhere else.
 */
export function signAppJwt(appId: string, privateKeyPem: string): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: nowSeconds - 60, // allow for clock drift
    exp: nowSeconds + 9 * 60,
    iss: appId,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKeyPem);

  return `${signingInput}.${base64url(signature)}`;
}
