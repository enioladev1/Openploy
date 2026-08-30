import { beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_CHECK_PLATFORM_UPDATE, JOB_PERFORM_PLATFORM_UPDATE } from "@openploy/shared";

const state = {
  settings: null as any,
  updates: [] as any[],
  inserted: [] as any[],
};

const enqueueJobMock = vi.fn(async () => "job-id");

vi.mock("../db", () => ({
  db: {
    query: {
      platformSettings: { findFirst: vi.fn(async () => state.settings) },
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
  auditLogs: { id: "id-column" },
}));

vi.mock("@openploy/queue", () => ({ enqueueJob: enqueueJobMock }));

const { checkPlatformUpdateNow, getPlatformUpdateStatus, triggerPlatformUpdate } = await import("./platform-update-service");

const organizationId = "018e5a3e-0000-7000-8000-000000000099";
const userId = "018e5a3e-0000-7000-8000-000000000001";

describe("getPlatformUpdateStatus", () => {
  beforeEach(() => {
    state.settings = null;
  });

  it("returns safe defaults when no platformSettings row exists yet (fresh install, before the first check tick)", async () => {
    const status = await getPlatformUpdateStatus();
    expect(status).toMatchObject({ updateAvailable: false, updateStatus: "idle" });
  });

  it("reflects the stored row when one exists", async () => {
    state.settings = {
      updateAvailable: true,
      updateStatus: "success",
      currentWebVersion: "v1.2.0",
      latestVersion: "v1.2.0",
    };
    const status = await getPlatformUpdateStatus();
    expect(status).toMatchObject({ updateAvailable: true, updateStatus: "success" });
  });
});

describe("triggerPlatformUpdate", () => {
  beforeEach(() => {
    state.settings = null;
    state.updates = [];
    state.inserted = [];
    enqueueJobMock.mockClear();
  });

  it("rejects triggering while an update is already running", async () => {
    state.settings = { id: "settings-1", updateStatus: "running" };
    await expect(triggerPlatformUpdate(organizationId, userId)).rejects.toThrow(/already running/);
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });

  it("claims 'running' and enqueues the update job with the target version when an existing row is idle", async () => {
    state.settings = { id: "settings-1", updateStatus: "success", latestVersion: "v1.3.0" };

    await triggerPlatformUpdate(organizationId, userId);

    expect(state.updates).toEqual([{ updateStatus: "running" }]);
    expect(enqueueJobMock).toHaveBeenCalledWith(JOB_PERFORM_PLATFORM_UPDATE, { version: "v1.3.0" });
  });

  it("rejects triggering when no update has ever been detected (no row, or no latestVersion yet)", async () => {
    state.settings = null;
    await expect(triggerPlatformUpdate(organizationId, userId)).rejects.toThrow(/check for one first/);
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });

  it("rejects triggering when a row exists but no version has ever been checked", async () => {
    state.settings = { id: "settings-1", updateStatus: "idle", latestVersion: null };
    await expect(triggerPlatformUpdate(organizationId, userId)).rejects.toThrow(/check for one first/);
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });

  it("writes an audit log entry for the trigger", async () => {
    state.settings = { id: "settings-1", updateStatus: "idle", latestVersion: "v1.3.0" };

    await triggerPlatformUpdate(organizationId, userId);

    const auditWrite = state.inserted.find((v) => v.action === "platform_settings.trigger_update");
    expect(auditWrite).toMatchObject({ organizationId, actorUserId: userId, targetType: "platform_settings" });
  });
});

describe("checkPlatformUpdateNow", () => {
  beforeEach(() => {
    enqueueJobMock.mockClear();
  });

  it("enqueues an on-demand check job", async () => {
    await checkPlatformUpdateNow();
    expect(enqueueJobMock).toHaveBeenCalledWith(JOB_CHECK_PLATFORM_UPDATE, {});
  });
});
