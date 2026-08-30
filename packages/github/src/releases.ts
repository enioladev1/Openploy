import { fetchWithRetry } from "./retry";

/**
 * The tag name of the latest published GitHub Release - unauthenticated
 * public API, same anonymous pattern as the GHCR digest check. Used by the
 * self-update feature's periodic tick, which is exactly the kind of
 * background caller fetchWithRetry's rate-limit floor exists for.
 */
export async function getLatestReleaseVersion(owner: string, repo: string): Promise<string> {
  const response = await fetchWithRetry(
    `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
    { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(10_000) },
    { honorRateLimitFloor: true },
  );
  if (!response.ok) {
    throw new Error(`Failed to read the latest release for ${owner}/${repo}: ${response.status}`);
  }

  const release = (await response.json()) as { tag_name?: string };
  if (!release.tag_name) throw new Error(`GitHub returned no tag_name for ${owner}/${repo}'s latest release`);
  return release.tag_name;
}
