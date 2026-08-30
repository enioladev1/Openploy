import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  existingSettings: undefined as any,
  updates: [] as any[],
  inserted: [] as any[],
  webVersion: null as string | null,
  latestVersion: "v1.2.0",
};

vi.mock("../db", () => ({
  db: {
    query: {
      platformSettings: { findFirst: vi.fn(async () => state.existingSettings) },
    },
    update: vi.fn(() => ({
      set: (values: any) => ({
        where: async () => {
          state.updates.push(values);
        },
      }),
    })),
    insert: vi.fn(() => ({
      values: async (values: any) => {
        state.inserted.push(values);
      },
    })),
  },
}));

vi.mock("@openploy/db", () => ({
  platformSettings: { id: "id-column" },
}));

vi.mock("@openploy/docker", () => ({
  getServiceImage: vi.fn(async (_name: string) => "ghcr.io/enioladev1/openploy-web@sha256:deadbeef"),
  getImageEnvVar: vi.fn(async (_image: string, _key: string) => state.webVersion),
}));

vi.mock("@openploy/github", () => ({
  getLatestReleaseVersion: vi.fn(async (_owner: string, _repo: string) => state.latestVersion),
}));

const { processCheckPlatformUpdateJob } = await import("./check-platform-update");

describe("processCheckPlatformUpdateJob", () => {
  beforeEach(() => {
    state.existingSettings = undefined;
    state.updates = [];
    state.inserted = [];
    state.webVersion = "v1.2.0";
    state.latestVersion = "v1.2.0";
    process.env.OPENPLOY_VERSION = "v1.2.0";
  });

  it("reports no update available when both versions already match the latest release", async () => {
    await processCheckPlatformUpdateJob();

    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      updateAvailable: false,
      currentWebVersion: "v1.2.0",
      currentAgentVersion: "v1.2.0",
      latestVersion: "v1.2.0",
    });
  });

  it("reports an update available when web is behind the latest release", async () => {
    state.webVersion = "v1.1.0";

    await processCheckPlatformUpdateJob();

    expect(state.inserted[0]).toMatchObject({ updateAvailable: true, currentWebVersion: "v1.1.0", latestVersion: "v1.2.0" });
  });

  it("reports an update available when agent is behind the latest release", async () => {
    process.env.OPENPLOY_VERSION = "v1.1.0";

    await processCheckPlatformUpdateJob();

    expect(state.inserted[0]).toMatchObject({ updateAvailable: true, currentAgentVersion: "v1.1.0" });
  });

  it("treats an unknown current web version (e.g. pre-versioning install) as needing an update, not a crash", async () => {
    state.webVersion = null;

    await processCheckPlatformUpdateJob();

    expect(state.inserted[0]).toMatchObject({ updateAvailable: true, currentWebVersion: null });
  });

  it("updates the existing row instead of inserting a new one when platformSettings already has a row", async () => {
    state.existingSettings = { id: "existing-id" };

    await processCheckPlatformUpdateJob();

    expect(state.inserted).toEqual([]);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ updateAvailable: false });
  });
});
