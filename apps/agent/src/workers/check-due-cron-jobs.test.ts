import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  jobs: [] as any[],
  updates: [] as any[],
  enqueued: [] as Array<{ name: string; data: unknown }>,
};

vi.mock("../db", () => ({
  db: {
    query: {
      serviceCronJobs: { findMany: vi.fn(async () => state.jobs) },
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

const { processCheckDueCronJobsJob } = await import("./check-due-cron-jobs");

function cronJob(overrides: Partial<Record<string, unknown>>) {
  return {
    id: "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d",
    isEnabled: true,
    cronExpression: "* * * * *", // every minute - always "due" relative to any past reference point
    createdAt: new Date(Date.now() - 10 * 60 * 1000),
    lastRunAt: null,
    lastRunStatus: null,
    ...overrides,
  };
}

describe("processCheckDueCronJobsJob", () => {
  beforeEach(() => {
    state.jobs = [];
    state.updates = [];
    state.enqueued = [];
  });

  it("triggers a job that has never run, and claims it as running first", async () => {
    state.jobs = [cronJob({ id: "a" })];
    await processCheckDueCronJobsJob();
    expect(state.enqueued).toEqual([{ name: "run-cron-job", data: { cronJobId: "a" } }]);
    expect(state.updates).toEqual([{ lastRunStatus: "running" }]);
  });

  it("does not trigger a job whose next fire time hasn't arrived yet", async () => {
    // Once-a-year expression, last ran a minute ago - next fire is ~a year out.
    state.jobs = [cronJob({ id: "b", cronExpression: "0 0 1 1 *", lastRunAt: new Date(Date.now() - 60 * 1000), lastRunStatus: "success" })];
    await processCheckDueCronJobsJob();
    expect(state.enqueued).toEqual([]);
  });

  it("triggers a job whose cron schedule has elapsed since its last run", async () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    state.jobs = [cronJob({ id: "c", cronExpression: "* * * * *", lastRunAt: twoMinutesAgo, lastRunStatus: "success" })];
    await processCheckDueCronJobsJob();
    expect(state.enqueued).toEqual([{ name: "run-cron-job", data: { cronJobId: "c" } }]);
  });

  it("skips a job that is currently running", async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    state.jobs = [cronJob({ id: "d", lastRunAt: fiveMinutesAgo, lastRunStatus: "running" })];
    await processCheckDueCronJobsJob();
    expect(state.enqueued).toEqual([]);
  });

  it("re-triggers a job stuck 'running' for over 2 hours, treating it as abandoned", async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    state.jobs = [cronJob({ id: "e", cronExpression: "0 0 1 1 *", lastRunAt: threeHoursAgo, lastRunStatus: "running" })];
    await processCheckDueCronJobsJob();
    expect(state.enqueued).toEqual([{ name: "run-cron-job", data: { cronJobId: "e" } }]);
  });

  it("skips a job with a malformed cron expression instead of crashing the tick", async () => {
    state.jobs = [cronJob({ id: "f", cronExpression: "not a cron string" }), cronJob({ id: "g" })];
    await processCheckDueCronJobsJob();
    // "g" (valid) still gets triggered even though "f" (invalid) is skipped.
    expect(state.enqueued).toEqual([{ name: "run-cron-job", data: { cronJobId: "g" } }]);
  });
});
