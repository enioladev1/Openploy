import { beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_RUN_DATABASE_BACKUP } from "@openploy/shared";

const state = {
  schedule: null as any,
  service: null as any,
  updates: [] as any[],
};

const enqueueJobMock = vi.fn(async () => "job-id");

vi.mock("../db", () => ({
  db: {
    query: {
      databaseBackupSchedules: { findFirst: vi.fn(async () => state.schedule) },
    },
    update: vi.fn(() => ({
      set: (values: any) => ({
        where: async () => {
          state.updates.push(values);
        },
      }),
    })),
  },
}));

vi.mock("@openploy/db", () => ({
  databaseBackupSchedules: { id: "id-column", serviceId: "service-id-column" },
  backupStorageConfigs: { id: "id-column" },
  databaseServices: { serviceId: "service-id-column" },
  getOrgScopedService: vi.fn(async () => state.service),
}));

vi.mock("@openploy/queue", () => ({ enqueueJob: enqueueJobMock }));

const { triggerBackupNow } = await import("./database-backup-service");

const scheduleId = "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d";
const organizationId = "018e5a3e-0000-7000-8000-000000000099";

describe("triggerBackupNow", () => {
  beforeEach(() => {
    state.schedule = null;
    state.service = null;
    state.updates = [];
    enqueueJobMock.mockClear();
  });

  it("throws NotFoundError when the schedule doesn't exist", async () => {
    await expect(triggerBackupNow(organizationId, scheduleId)).rejects.toThrow("Backup schedule not found");
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the schedule's service isn't in the caller's org", async () => {
    state.schedule = { id: scheduleId, serviceId: "svc-1", lastRunStatus: null };
    state.service = null; // getOrgScopedService returns nothing for a different org
    await expect(triggerBackupNow(organizationId, scheduleId)).rejects.toThrow("Backup schedule not found");
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });

  it("rejects triggering a schedule that is already running", async () => {
    state.schedule = { id: scheduleId, serviceId: "svc-1", lastRunStatus: "running", updatedAt: new Date() };
    state.service = { id: "svc-1" };
    await expect(triggerBackupNow(organizationId, scheduleId)).rejects.toThrow(/already running/);
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });

  it("allows retriggering a long-abandoned 'running' schedule (agent crashed mid-run)", async () => {
    const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);
    state.schedule = { id: scheduleId, serviceId: "svc-1", lastRunStatus: "running", updatedAt: sevenHoursAgo };
    state.service = { id: "svc-1" };

    await triggerBackupNow(organizationId, scheduleId);

    expect(enqueueJobMock).toHaveBeenCalledWith(JOB_RUN_DATABASE_BACKUP, { scheduleId });
  });

  it("claims the schedule and enqueues a run job when idle", async () => {
    state.schedule = { id: scheduleId, serviceId: "svc-1", lastRunStatus: "success" };
    state.service = { id: "svc-1" };

    await triggerBackupNow(organizationId, scheduleId);

    expect(state.updates).toEqual([{ lastRunStatus: "running" }]);
    expect(enqueueJobMock).toHaveBeenCalledWith(JOB_RUN_DATABASE_BACKUP, { scheduleId });
  });

  it("allows triggering a schedule that has never run", async () => {
    state.schedule = { id: scheduleId, serviceId: "svc-1", lastRunStatus: null };
    state.service = { id: "svc-1" };

    await triggerBackupNow(organizationId, scheduleId);

    expect(enqueueJobMock).toHaveBeenCalledWith(JOB_RUN_DATABASE_BACKUP, { scheduleId });
  });
});
