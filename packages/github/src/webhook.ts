import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies GitHub's X-Hub-Signature-256 header against the raw request body.
 * Must run on the raw, unparsed body - HMAC is computed over exact bytes, and
 * re-serializing parsed JSON before checking would silently break verification
 * (and worse, could be made to pass for a differently-shaped payload).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", webhookSecret).update(rawBody, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signatureHeader.slice("sha256=".length), "hex");

  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export interface GithubPushEvent {
  ref: string; // "refs/heads/main"
  installationId: string;
  repoFullName: string;
  repoOwner: string;
  repoName: string;
  headCommitSha: string | null;
  headCommitMessage: string | null;
  headCommitAuthor: string | null;
}

export function parsePushEvent(rawBody: string): GithubPushEvent {
  const payload = JSON.parse(rawBody) as {
    ref: string;
    installation: { id: number };
    repository: { full_name: string; name: string; owner: { login: string } };
    head_commit: { id: string; message: string; author: { name: string } } | null;
  };

  return {
    ref: payload.ref,
    installationId: String(payload.installation.id),
    repoFullName: payload.repository.full_name,
    repoOwner: payload.repository.owner.login,
    repoName: payload.repository.name,
    headCommitSha: payload.head_commit?.id ?? null,
    headCommitMessage: payload.head_commit?.message ?? null,
    headCommitAuthor: payload.head_commit?.author.name ?? null,
  };
}

export function branchFromRef(ref: string): string | null {
  const prefix = "refs/heads/";
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : null;
}
