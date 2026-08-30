import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { getRemoteImageDigest } = await import("./ghcr");

function tokenResponse(ok = true) {
  return { ok, status: 200, json: async () => ({ token: "fake-token" }) };
}

function manifestResponse(digest: string | null, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: { get: (name: string) => (name === "Docker-Content-Digest" ? digest : null) },
  };
}

describe("getRemoteImageDigest", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("rejects a non-ghcr.io image reference", async () => {
    await expect(getRemoteImageDigest("docker.io/library/nginx:alpine")).rejects.toThrow(/Not a ghcr\.io image reference/);
  });

  it("gets an anonymous token then reads Docker-Content-Digest from a manifest HEAD", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(manifestResponse("sha256:abc123"));

    const digest = await getRemoteImageDigest("ghcr.io/enioladev1/openploy-web:latest");

    expect(digest).toBe("sha256:abc123");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://ghcr.io/token?service=ghcr.io&scope=repository:enioladev1/openploy-web:pull",
      expect.anything(),
    );
    const [manifestUrl, manifestInit] = fetchMock.mock.calls[1]!;
    expect(manifestUrl).toBe("https://ghcr.io/v2/enioladev1/openploy-web/manifests/latest");
    expect(manifestInit.method).toBe("HEAD");
    expect(manifestInit.headers.Authorization).toBe("Bearer fake-token");
  });

  it("throws when the token request fails", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse(false));
    await expect(getRemoteImageDigest("ghcr.io/enioladev1/openploy-web:latest")).rejects.toThrow(/Failed to get a GHCR token/);
  });

  it("throws when the manifest request fails", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(manifestResponse(null, false, 404));
    await expect(getRemoteImageDigest("ghcr.io/enioladev1/openploy-web:latest")).rejects.toThrow(/Failed to read the/);
  });

  it("throws when no Docker-Content-Digest header comes back", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(manifestResponse(null));
    await expect(getRemoteImageDigest("ghcr.io/enioladev1/openploy-web:latest")).rejects.toThrow(/didn't return a Docker-Content-Digest/);
  });
});
