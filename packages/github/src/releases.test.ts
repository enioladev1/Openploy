import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { getLatestReleaseVersion } = await import("./releases");

function releaseResponse(tagName: string | undefined, ok = true, status = 200) {
  return { ok, status, json: async () => ({ tag_name: tagName }) };
}

describe("getLatestReleaseVersion", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("returns the latest release's tag name", async () => {
    fetchMock.mockResolvedValueOnce(releaseResponse("v1.3.0"));

    const version = await getLatestReleaseVersion("enioladev1", "Openploy");

    expect(version).toBe("v1.3.0");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/enioladev1/Openploy/releases/latest",
      expect.anything(),
    );
  });

  it("throws when the request fails", async () => {
    fetchMock.mockResolvedValueOnce(releaseResponse(undefined, false, 404));
    await expect(getLatestReleaseVersion("enioladev1", "Openploy")).rejects.toThrow(/Failed to read the latest release/);
  });

  it("throws when the response has no tag_name", async () => {
    fetchMock.mockResolvedValueOnce(releaseResponse(undefined));
    await expect(getLatestReleaseVersion("enioladev1", "Openploy")).rejects.toThrow(/no tag_name/);
  });
});
