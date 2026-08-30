import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { runningSince: null as Date | null };

vi.mock("@openploy/docker", () => ({
  getServiceRunningSince: vi.fn(async () => state.runningSince),
  waitForServiceRunState: vi.fn(),
}));

vi.mock("@openploy/queue", () => ({ enqueueJob: vi.fn(async () => "job-id") }));
vi.mock("./log-writer", () => ({ createLogWriter: vi.fn() }));
vi.mock("./runtime-logs", () => ({ startRuntimeLogTail: vi.fn() }));

const { resolveRuntimeStatusChangedAt } = await import("./service-lifecycle");

describe("resolveRuntimeStatusChangedAt", () => {
  beforeEach(() => {
    state.runningSince = null;
  });

  it("returns Docker's own task start time when the service is running", async () => {
    const since = new Date("2026-01-01T00:00:00Z");
    state.runningSince = since;
    const result = await resolveRuntimeStatusChangedAt("app-1", "running");
    expect(result).toEqual(since);
  });

  it("falls back to now when the service is running but Docker has no timestamp", async () => {
    const before = Date.now();
    const result = await resolveRuntimeStatusChangedAt("app-1", "running");
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("returns now (not Docker's timestamp) for any non-running state", async () => {
    state.runningSince = new Date("2020-01-01T00:00:00Z");
    const before = Date.now();
    const result = await resolveRuntimeStatusChangedAt("app-1", "failed");
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
  });
});
