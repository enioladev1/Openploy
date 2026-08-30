const ACCEPT_HEADER =
  "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json";

function parseImageRef(image: string): { owner: string; repo: string; tag: string } {
  // "ghcr.io/<owner>/<repo>:<tag>" - the only shape this platform ever
  // publishes/consumes for its own images (see .github/workflows/publish-images.yml).
  const match = /^ghcr\.io\/([^/]+)\/([^:]+):(.+)$/.exec(image);
  if (!match) throw new Error(`Not a ghcr.io image reference: ${image}`);
  const [, owner, repo, tag] = match;
  return { owner: owner!, repo: repo!, tag: tag! };
}

/**
 * The latest digest GHCR has for this image's tag, via the plain OCI
 * Distribution v2 API - no docker CLI/daemon involved, just an anonymous
 * token (works because these images are published public) and a manifest
 * HEAD. Used for the periodic "is an update available" check, which must
 * stay cheap - this never pulls the image itself.
 */
export async function getRemoteImageDigest(image: string): Promise<string> {
  const { owner, repo, tag } = parseImageRef(image);

  const tokenResponse = await fetch(
    `https://ghcr.io/token?service=ghcr.io&scope=repository:${owner}/${repo}:pull`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!tokenResponse.ok) throw new Error(`Failed to get a GHCR token for ${owner}/${repo}: ${tokenResponse.status}`);
  const { token } = (await tokenResponse.json()) as { token: string };

  const manifestResponse = await fetch(`https://ghcr.io/v2/${owner}/${repo}/manifests/${tag}`, {
    method: "HEAD",
    headers: { Authorization: `Bearer ${token}`, Accept: ACCEPT_HEADER },
    signal: AbortSignal.timeout(10_000),
  });
  if (!manifestResponse.ok) {
    throw new Error(`Failed to read the ${owner}/${repo}:${tag} manifest from GHCR: ${manifestResponse.status}`);
  }

  const digest = manifestResponse.headers.get("Docker-Content-Digest");
  if (!digest) throw new Error(`GHCR didn't return a Docker-Content-Digest header for ${owner}/${repo}:${tag}`);
  return digest;
}
