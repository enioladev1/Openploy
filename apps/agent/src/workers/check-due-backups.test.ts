import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  schedules: [] as any[],
  updates: [] as any[],
  enqueued: [] as Array<{ name: string; data: unknown }>,
};

vi.mock("../db", () => ({
  db: {
    query: {
      databaseBackupSchedules: { findMany: vi.fn(async () => state.schedules) },
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

vi.mock("@openploy/queue", () => ({
  enqueueJob: vi.fn(async (name: string, data: unknown) => {
    state.enqueued.push({ name, data });
  }),
}));

const { processCheckDueBackupsJob } = await import("./check-due-backups");

function schedule(overrides: Partial<Record<string, unknown>>) {
  return {
    id: "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d",
    isEnabled: true,
    frequency: "daily",
    lastRunAt: null,
    lastRunStatus: null,
    // Real rows always have this (timestamps() column) - stuck-detection
    // keys off it, not lastRunAt (see isBackupRunStuck's comment).
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("processCheckDueBackupsJob", () => {
  beforeEach(() => {
    state.schedules = [];
    state.updates = [];
    state.enqueued = [];
  });

  it("triggers a schedule that has never run, and claims it as running first", async () => {
    state.schedules = [schedule({ id: "a" })];
    await processCheckDueBackupsJob();
    expect(state.enqueued).toEqual([{ name: "run-database-backup", data: { scheduleId: "a" } }]);
    expect(state.updates).toEqual([{ lastRunStatus: "running" }]);
  });

  it("does not trigger a schedule whose interval has not elapsed yet", async () => {
    state.schedules = [schedule({ id: "b", frequency: "daily", lastRunAt: new Date(), lastRunStatus: "success" })];
    await processCheckDueBackupsJob();
    expect(state.enqueued).toEqual([]);
  });

  it("triggers an hourly schedule that last ran 2 hours ago", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    state.schedules = [schedule({ id: "c", frequency: "hourly", lastRunAt: twoHoursAgo, lastRunStatus: "success" })];
    await processCheckDueBackupsJob();
    expect(state.enqueued).toEqual([{ name: "run-database-backup", data: { scheduleId: "c" } }]);
  });

  it("skips a schedule that is currently running", async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    state.schedules = [
      schedule({ id: "d", frequency: "hourly", lastRunAt: null, lastRunStatus: "running", updatedAt: fiveMinutesAgo }),
    ];
    await processCheckDueBackupsJob();
    expect(state.enqueued).toEqual([]);
  });

  // Must outlive the job's own 4h expireInHours, or a slow-but-healthy backup
  // gets declared abandoned and re-triggered underneath itself.
  it("does not re-trigger a 'running' schedule that is still within the job's own expiry window", async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    state.schedules = [
      schedule({ id: "g", frequency: "hourly", lastRunAt: null, lastRunStatus: "running", updatedAt: threeHoursAgo }),
    ];
    await processCheckDueBackupsJob();
    expect(state.enqueued).toEqual([]);
  });

  it("re-triggers a long-abandoned 'running' schedule - even on its very first ever run (lastRunAt still null)", async () => {
    const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);
    state.schedules = [
      schedule({ id: "e", frequency: "daily", lastRunAt: null, lastRunStatus: "running", updatedAt: sevenHoursAgo }),
    ];
    await processCheckDueBackupsJob();
    expect(state.enqueued).toEqual([{ name: "run-database-backup", data: { scheduleId: "e" } }]);
  });
});
