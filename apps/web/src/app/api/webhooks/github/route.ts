import { branchFromRef, parsePushEvent, verifyWebhookSignature } from "@openploy/github";
import { findInstallationByGithubId, getWebhookSecret } from "@/server/services/github-service";
import { triggerWebhookDeployments } from "@/server/services/deployment-service";

/**
 * Public, unauthenticated by necessity (GitHub calls this directly) - every
 * other guarantee comes from the HMAC signature check below, which must run
 * before any parsing of the body. See packages/github/src/webhook.ts.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const eventType = request.headers.get("x-github-event");
  const deliveryId = request.headers.get("x-github-delivery");

  let webhookSecret: string;
  try {
    webhookSecret = await getWebhookSecret();
  } catch {
    // No GitHub App registered yet - nothing to verify against, so nothing to trust.
    return new Response("Not configured", { status: 503 });
  }

  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  if (!deliveryId) {
    return new Response("Missing delivery id", { status: 400 });
  }

  if (eventType === "push") {
    const event = parsePushEvent(rawBody);
    const branch = branchFromRef(event.ref);
    const installation = await findInstallationByGithubId(event.installationId);

    if (branch && installation) {
      await triggerWebhookDeployments(
        installation.id,
        event.repoOwner,
        event.repoName,
        branch,
        { sha: event.headCommitSha, message: event.headCommitMessage, author: event.headCommitAuthor },
        deliveryId,
      );
    }
  }

  // installation / installation_repositories events are accepted but not yet
  // acted on (repo cache sync is a UI-polish follow-up, not load-bearing for deploys).
  return new Response("ok", { status: 200 });
}
