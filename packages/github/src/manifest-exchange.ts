const GITHUB_API_BASE = "https://api.github.com";

export interface CreatedGithubApp {
  id: number;
  slug: string;
  pem: string;
  webhookSecret: string;
  clientId: string;
  clientSecret: string;
}

/**
 * One-time exchange of the manifest-flow code for the app's real credentials.
 * The code is single-use and expires quickly, per GitHub's documented flow.
 */
export async function exchangeManifestCode(code: string): Promise<CreatedGithubApp> {
  const response = await fetch(`${GITHUB_API_BASE}/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!response.ok) {
    throw new Error(`GitHub manifest conversion failed: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as {
    id: number;
    slug: string;
    pem: string;
    webhook_secret: string;
    client_id: string;
    client_secret: string;
  };

  return {
    id: body.id,
    slug: body.slug,
    pem: body.pem,
    webhookSecret: body.webhook_secret,
    clientId: body.client_id,
    clientSecret: body.client_secret,
  };
}
