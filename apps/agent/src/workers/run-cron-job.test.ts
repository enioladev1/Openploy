import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  cronJob: undefined as any,
  service: undefined as any,
  compose: undefined as any,
  runInserted: [] as any[],
  updates: [] as Array<{ table: any; values: any }>,
  execCalls: [] as Array<{ serviceName: string; cmd: string[] }>,
  execImpl: vi.fn(async () => "command output"),
};

vi.mock("@openploy/db", () => ({
  serviceCronJobRuns: { id: "run-id-column" },
  serviceCronJobs: { id: "id-column" },
  services: { id: "id-column" },
  composeServices: { serviceId: "service-id-column" },
}));

vi.mock("../db", () => ({
  db: {
    query: {
      serviceCronJobs: { findFirst: vi.fn(async () => state.cronJob) },
      services: { findFirst: vi.fn(async () => state.service) },
      composeServices: { findFirst: vi.fn(async () => state.compose) },
    },
    insert: vi.fn((table: any) => ({
      values: (values: any) => ({
        returning: async () => {
          const row = { id: "run-1", ...values };
          state.runInserted.push({ table, values, row });
          return [row];
        },
      }),
    })),
    transaction: async (fn: any) => {
      const tx = {
        update: vi.fn((table: any) => ({
          set: (values: any) => ({
            where: async () => {
              state.updates.push({ table, values });
            },
          }),
        })),
      };
      return fn(tx);
    },
  },
}));

vi.mock("@openploy/docker", () => ({
  execInContainer: vi.fn(async (serviceName: string, opts: { cmd: string[] }) => {
    state.execCalls.push({ serviceName, ...opts });
    return state.execImpl();
  }),
}));

const { processRunCronJobJob } = await import("./run-cron-job");

const baseCronJob = {
  id: "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d",
  serviceId: "018e5a3e-0000-7000-8000-000000000001",
  command: "php artisan migrate",
};

// The job-summary update is always the second of the pair (run row, then job).
function lastJobUpdate() {
  return state.updates.at(-1)!.values;
}
function lastRunUpdate() {
  return state.updates.at(-2)!.values;
}

describe("processRunCronJobJob", () => {
  beforeEach(() => {
    state.cronJob = { ...baseCronJob };
    state.service = undefined;
    state.compose = undefined;
    state.runInserted = [];
    state.updates = [];
    state.execCalls = [];
    state.execImpl = vi.fn(async () => "command output");
  });

  it("does nothing if the cron job was deleted before it ran", async () => {
    state.cronJob = undefined;
    await processRunCronJobJob({ cronJobId: baseCronJob.id });
    expect(state.runInserted).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it("creates a run row snapshotting the command before doing anything else", async () => {
    state.service = { id: baseCronJob.serviceId, type: "application" };
    await processRunCronJobJob({ cronJobId: baseCronJob.id });
    expect(state.runInserted).toHaveLength(1);
    expect(state.runInserted[0].values).toMatchObject({
      cronJobId: baseCronJob.id,
      command: "php artisan migrate",
      status: "running",
    });
  });

  it("marks failed if the parent service no longer exists", async () => {
    state.service = undefined;
    await processRunCronJobJob({ cronJobId: baseCronJob.id });
    expect(lastJobUpdate()).toMatchObject({ lastRunStatus: "failed" });
    expect(lastJobUpdate().lastRunOutput).toMatch(/no longer exists/);
    expect(lastRunUpdate()).toMatchObject({ status: "failed" });
  });

  it("execs the command inside app-<serviceId> for an application service and records the output on both the run and the job", async () => {
    state.service = { id: baseCronJob.serviceId, type: "application" };

    await processRunCronJobJob({ cronJobId: baseCronJob.id });

    expect(state.execCalls).toEqual([{ serviceName: `app-${baseCronJob.serviceId}`, cmd: ["sh", "-c", "php artisan migrate"] }]);
    expect(lastJobUpdate()).toMatchObject({ lastRunStatus: "success", lastRunOutput: "command output" });
    expect(lastRunUpdate()).toMatchObject({ status: "success", output: "command output" });
  });

  it("execs inside db-<serviceId> for a database service", async () => {
    state.service = { id: baseCronJob.serviceId, type: "database" };
    await processRunCronJobJob({ cronJobId: baseCronJob.id });
    expect(state.execCalls[0]!.serviceName).toBe(`db-${baseCronJob.serviceId}`);
  });

  it("execs inside stack-<serviceId>_<exposedInnerService> for a compose service", async () => {
    state.service = { id: baseCronJob.serviceId, type: "compose" };
    state.compose = { serviceId: baseCronJob.serviceId, exposedInnerService: "web" };

    await processRunCronJobJob({ cronJobId: baseCronJob.id });

    expect(state.execCalls[0]!.serviceName).toBe(`stack-${baseCronJob.serviceId}_web`);
  });

  it("fails clearly when a compose service has no exposed inner service configured", async () => {
    state.service = { id: baseCronJob.serviceId, type: "compose" };
    state.compose = { serviceId: baseCronJob.serviceId, exposedInnerService: null };

    await processRunCronJobJob({ cronJobId: baseCronJob.id });

    expect(state.execCalls).toEqual([]);
    expect(lastJobUpdate()).toMatchObject({ lastRunStatus: "failed" });
    expect(lastJobUpdate().lastRunOutput).toMatch(/no exposed inner service/);
  });

  it("marks failed and stores the error message when the command exits non-zero", async () => {
    state.service = { id: baseCronJob.serviceId, type: "application" };
    state.execImpl = vi.fn(async () => {
      throw new Error('command exited with code 1: "migrate" table already exists');
    });

    await processRunCronJobJob({ cronJobId: baseCronJob.id });

    expect(lastJobUpdate()).toMatchObject({ lastRunStatus: "failed" });
    expect(lastJobUpdate().lastRunOutput).toMatch(/already exists/);
  });

  it("truncates very long output before storing it", async () => {
    state.service = { id: baseCronJob.serviceId, type: "application" };
    state.execImpl = vi.fn(async () => "x".repeat(20000));

    await processRunCronJobJob({ cronJobId: baseCronJob.id });

    expect(lastJobUpdate().lastRunOutput.length).toBeLessThanOrEqual(8000);
    expect(lastRunUpdate().output.length).toBeLessThanOrEqual(8000);
  });
});
