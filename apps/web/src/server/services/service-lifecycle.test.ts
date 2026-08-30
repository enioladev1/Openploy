import { beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_RELOAD_SERVICE, JOB_START_SERVICE, JOB_STOP_SERVICE } from "@openploy/shared";

interface FakeService {
  id: string;
  runtimeStatus: string;
}

const state = { service: null as FakeService | null };
const enqueueJobMock = vi.fn(async () => "job-id");

vi.mock("../db", () => ({
  db: { query: { services: { findFirst: vi.fn(async () => state.service) } } },
}));

vi.mock("@openploy/queue", () => ({ enqueueJob: enqueueJobMock }));

const { reloadService, startService, stopService } = await import("./service-lifecycle");

describe("startService", () => {
  beforeEach(() => {
    state.service = null;
    enqueueJobMock.mockClear();
  });

  it("throws NotFoundError when the service doesn't exist", async () => {
    await expect(startService("missing-id")).rejects.toThrow("Service not found");
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });

  it("rejects starting a service that isn't stopped", async () => {
    state.service = { id: "svc-1", runtimeStatus: "running" };
    await expect(startService("svc-1")).rejects.toThrow(/not stopped/i);
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });

  it("enqueues the start job when the service is actually stopped", async () => {
    state.service = { id: "svc-1", runtimeStatus: "stopped" };
    await startService("svc-1");
    expect(enqueueJobMock).toHaveBeenCalledWith(JOB_START_SERVICE, { serviceId: "svc-1" });
  });
});

describe("reloadService / stopService", () => {
  beforeEach(() => {
    enqueueJobMock.mockClear();
  });

  it("reloadService enqueues unconditionally, no stopped-state gate", async () => {
    await reloadService("svc-2");
    expect(enqueueJobMock).toHaveBeenCalledWith(JOB_RELOAD_SERVICE, { serviceId: "svc-2" });
  });

  it("stopService enqueues unconditionally", async () => {
    await stopService("svc-3");
    expect(enqueueJobMock).toHaveBeenCalledWith(JOB_STOP_SERVICE, { serviceId: "svc-3" });
  });
});
