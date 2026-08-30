import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  pulledImage: undefined as string | undefined,
  events: [] as Array<{ status?: string; id?: string; progressDetail?: unknown; progress?: string }>,
  finishError: null as Error | null,
  repoDigests: undefined as string[] | undefined,
  imageEnv: undefined as string[] | undefined,
};

vi.mock("./client", () => ({
  getDockerClient: () => ({
    pull: vi.fn(async (image: string) => {
      state.pulledImage = image;
      return "fake-stream";
    }),
    modem: {
      followProgress: (
        _stream: unknown,
        onFinished: (err: Error | null) => void,
        onProgress: (event: unknown) => void,
      ) => {
        for (const event of state.events) onProgress(event);
        onFinished(state.finishError);
      },
    },
    getImage: () => ({
      inspect: vi.fn(async () => ({ RepoDigests: state.repoDigests, Config: { Env: state.imageEnv } })),
    }),
  }),
}));

const { getImageEnvVar, getLocalImageDigest, pullImageWithProgress } = await import("./pull-image");

describe("pullImageWithProgress", () => {
  beforeEach(() => {
    state.pulledImage = undefined;
    state.events = [];
    state.finishError = null;
  });

  it("pulls the given image", async () => {
    await pullImageWithProgress("mysql:8", () => {});
    expect(state.pulledImage).toBe("mysql:8");
  });

  it("formats a line as '<id>: <status>' when an id is present", async () => {
    state.events = [{ status: "Pulling fs layer", id: "9bebc71cfb90" }];
    const lines: string[] = [];
    await pullImageWithProgress("mysql:8", (line) => lines.push(line));
    expect(lines).toEqual(["9bebc71cfb90: Pulling fs layer"]);
  });

  it("formats a line as just the status when no id is present (Digest/Status summary lines)", async () => {
    state.events = [
      { status: "Digest: sha256:abc123" },
      { status: "Status: Downloaded newer image for mysql:8" },
    ];
    const lines: string[] = [];
    await pullImageWithProgress("mysql:8", (line) => lines.push(line));
    expect(lines).toEqual(["Digest: sha256:abc123", "Status: Downloaded newer image for mysql:8"]);
  });

  it("collapses repeated progress-only ticks within the same status into a single line", async () => {
    state.events = [
      { status: "Downloading", id: "abc", progressDetail: { current: 100, total: 1000 } },
      { status: "Downloading", id: "abc", progressDetail: { current: 500, total: 1000 } },
      { status: "Downloading", id: "abc", progressDetail: { current: 1000, total: 1000 } },
      { status: "Verifying Checksum", id: "abc" },
      { status: "Download complete", id: "abc" },
    ];
    const lines: string[] = [];
    await pullImageWithProgress("mysql:8", (line) => lines.push(line));
    expect(lines).toEqual(["abc: Downloading", "abc: Verifying Checksum", "abc: Download complete"]);
  });

  it("tracks status transitions independently per layer id", async () => {
    state.events = [
      { status: "Pulling fs layer", id: "layer-1" },
      { status: "Pulling fs layer", id: "layer-2" },
      { status: "Download complete", id: "layer-1" },
      { status: "Download complete", id: "layer-2" },
    ];
    const lines: string[] = [];
    await pullImageWithProgress("mysql:8", (line) => lines.push(line));
    expect(lines).toEqual([
      "layer-1: Pulling fs layer",
      "layer-2: Pulling fs layer",
      "layer-1: Download complete",
      "layer-2: Download complete",
    ]);
  });

  it("skips events with no status at all", async () => {
    state.events = [{ id: "abc" }, { status: "Pulling fs layer", id: "abc" }];
    const lines: string[] = [];
    await pullImageWithProgress("mysql:8", (line) => lines.push(line));
    expect(lines).toEqual(["abc: Pulling fs layer"]);
  });

  it("rejects when followProgress reports an error", async () => {
    state.finishError = new Error("pull access denied");
    await expect(pullImageWithProgress("private/nope:latest", () => {})).rejects.toThrow("pull access denied");
  });
});

describe("getLocalImageDigest", () => {
  beforeEach(() => {
    state.repoDigests = undefined;
  });

  it("extracts the digest portion of the first RepoDigest", async () => {
    state.repoDigests = ["ghcr.io/enioladev1/openploy-web@sha256:abc123"];
    expect(await getLocalImageDigest("ghcr.io/enioladev1/openploy-web:latest")).toBe("sha256:abc123");
  });

  it("returns null when the image has no RepoDigests", async () => {
    state.repoDigests = [];
    expect(await getLocalImageDigest("ghcr.io/enioladev1/openploy-web:latest")).toBeNull();
  });
});

describe("getImageEnvVar", () => {
  beforeEach(() => {
    state.imageEnv = undefined;
  });

  it("returns the value of a var baked into the image at build time", async () => {
    state.imageEnv = ["PATH=/usr/bin", "OPENPLOY_VERSION=v1.2.0"];
    expect(await getImageEnvVar("ghcr.io/enioladev1/openploy-web:v1.2.0", "OPENPLOY_VERSION")).toBe("v1.2.0");
  });

  it("returns null when the var isn't set on the image", async () => {
    state.imageEnv = ["PATH=/usr/bin"];
    expect(await getImageEnvVar("ghcr.io/enioladev1/openploy-web:v1.2.0", "OPENPLOY_VERSION")).toBeNull();
  });

  it("returns null when the image has no Config.Env at all", async () => {
    state.imageEnv = undefined;
    expect(await getImageEnvVar("ghcr.io/enioladev1/openploy-web:v1.2.0", "OPENPLOY_VERSION")).toBeNull();
  });
});
