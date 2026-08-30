import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  existingSettings: undefined as any,
  updates: [] as any[],
  inserted: [] as any[],
  calls: [] as string[],
  runCommandError: null as Error | null,
  updateServiceImageError: { web: null as Error | null, agent: null as Error | null },
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
          state.calls.push(`db:${values.updateStatus ?? "write"}`);
        },
      }),
    })),
    insert: vi.fn(() => ({
      values: async (values: any) => {
        state.inserted.push(values);
        state.calls.push(`db:${values.updateStatus ?? "write"}`);
      },
    })),
  },
}));

vi.mock("@openploy/db", () => ({
  platformSettings: { id: "id-column" },
}));

vi.mock("@openploy/docker", () => ({
  pullImageWithProgress: vi.fn(async (image: string) => {
    state.calls.push(`pull:${image}`);
  }),
  runCommand: vi.fn(async (command: string, args: string[]) => {
    state.calls.push(`run:${command} ${args.join(" ")}`);
    if (state.runCommandError) throw state.runCommandError;
  }),
  updateServiceImage: vi.fn(async (name: string, image: string) => {
    state.calls.push(`update-service:${name}:${image}`);
    if (name === "openploy_web" && state.updateServiceImageError.web) throw state.updateServiceImageError.web;
    if (name === "openploy_agent" && state.updateServiceImageError.agent) throw state.updateServiceImageError.agent;
  }),
}));

const { processPerformPlatformUpdateJob } = await import("./perform-platform-update");

describe("processPerformPlatformUpdateJob", () => {
  beforeEach(() => {
    state.existingSettings = { id: "settings-1" };
    state.updates = [];
    state.inserted = [];
    state.calls = [];
    state.runCommandError = null;
    state.updateServiceImageError = { web: null, agent: null };
    process.env.DATABASE_URL = "postgres://openploy:secret@postgres:5432/openploy";
    process.env.OPENPLOY_WEB_IMAGE = "ghcr.io/enioladev1/openploy-web:latest";
    process.env.OPENPLOY_AGENT_IMAGE = "ghcr.io/enioladev1/openploy-agent:latest";
  });

  it("pulls, migrates, updates web, marks success, then updates agent last - in that exact order, pinned to the target version", async () => {
    await processPerformPlatformUpdateJob({ version: "v1.3.0" });

    expect(state.calls).toEqual([
      "db:running",
      "pull:ghcr.io/enioladev1/openploy-web:v1.3.0",
      "pull:ghcr.io/enioladev1/openploy-agent:v1.3.0",
      "run:docker run --rm --network platform_internal -e DATABASE_URL=postgres://openploy:secret@postgres:5432/openploy ghcr.io/enioladev1/openploy-agent:v1.3.0 pnpm --filter @openploy/db migrate",
      "update-service:openploy_web:ghcr.io/enioladev1/openploy-web:v1.3.0",
      "db:success",
      "update-service:openploy_agent:ghcr.io/enioladev1/openploy-agent:v1.3.0",
    ]);
    expect(state.updates.find((u) => u.updateStatus === "success")).toMatchObject({
      currentWebVersion: "v1.3.0",
      currentAgentVersion: "v1.3.0",
    });
  });

  it("marks the DB successful before ever touching agent's own service", async () => {
    await processPerformPlatformUpdateJob({ version: "v1.3.0" });

    const successIndex = state.calls.indexOf("db:success");
    const agentUpdateIndex = state.calls.indexOf("update-service:openploy_agent:ghcr.io/enioladev1/openploy-agent:v1.3.0");
    expect(successIndex).toBeGreaterThanOrEqual(0);
    expect(agentUpdateIndex).toBeGreaterThan(successIndex);
  });

  it("never touches web or agent's service when migrations fail", async () => {
    state.runCommandError = new Error("migration failed: relation already exists");

    await processPerformPlatformUpdateJob({ version: "v1.3.0" });

    expect(state.calls.some((c) => c.startsWith("update-service:"))).toBe(false);
    expect(state.updates.at(-1)).toMatchObject({ updateStatus: "failed", updateError: "migration failed: relation already exists" });
  });

  it("never touches agent's service when updating web fails", async () => {
    state.updateServiceImageError.web = new Error("no suitable node");

    await processPerformPlatformUpdateJob({ version: "v1.3.0" });

    expect(state.calls.some((c) => c.includes("openploy_agent"))).toBe(false);
    expect(state.updates.at(-1)).toMatchObject({ updateStatus: "failed", updateError: "no suitable node" });
  });

  it("throws clearly instead of running with an unset DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;

    await processPerformPlatformUpdateJob({ version: "v1.3.0" });

    expect(state.calls.some((c) => c.startsWith("run:"))).toBe(false);
    expect(state.updates.at(-1)).toMatchObject({ updateStatus: "failed", updateError: "DATABASE_URL is not set" });
  });

  it("inserts a fresh row when no platformSettings row exists yet", async () => {
    state.existingSettings = undefined;

    await processPerformPlatformUpdateJob({ version: "v1.3.0" });

    expect(state.inserted.length).toBeGreaterThan(0);
    expect(state.updates).toEqual([]);
  });
});
