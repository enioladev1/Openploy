import { beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_RUN_CRON_JOB } from "@openploy/shared";

const state = {
  cronJob: null as any,
  service: null as any,
  listRows: [] as any[],
  runRows: [] as any[],
  inserted: [] as any[],
  updates: [] as any[],
  deletes: [] as any[],
};

const enqueueJobMock = vi.fn(async () => "job-id");

vi.mock("../db", () => ({
  db: {
    query: {
      serviceCronJobs: {
        findFirst: vi.fn(async () => state.cronJob),
        findMany: vi.fn(async () => state.listRows),
      },
      serviceCronJobRuns: {
        findMany: vi.fn(async () => state.runRows),
      },
    },
    insert: vi.fn(() => ({
      values: (values: any) => ({
        returning: async () => {
          const row = { id: "new-cron-job-id", ...values };
          state.inserted.push({ values, row });
          return [row];
        },
      }),
    })),
    update: vi.fn(() => ({
      set: (values: any) => ({
        where: () => {
          // Record here, not inside .returning() - setCronJobEnabled/
          // triggerCronJobNow never chain .returning() at all.
          state.updates.push(values);
          const row = { id: "updated-cron-job-id", ...values };
          return { returning: async () => [row], then: (resolve: any) => resolve(undefined) };
        },
      }),
    })),
    delete: vi.fn(() => ({
      where: async () => {
        state.deletes.push(true);
      },
    })),
  },
}));

vi.mock("@openploy/db", () => ({
  serviceCronJobs: { id: "id-column", serviceId: "service-id-column" },
  serviceCronJobRuns: { cronJobId: "cron-job-id-column", startedAt: "started-at-column" },
  getOrgScopedService: vi.fn(async () => state.service),
}));

vi.mock("@openploy/queue", () => ({ enqueueJob: enqueueJobMock }));

const { createCronJob, deleteCronJob, listCronJobRuns, listCronJobs, setCronJobEnabled, triggerCronJobNow, updateCronJob } =
  await import("./cron-job-service");

const cronJobId = "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d";
const serviceId = "018e5a3e-0000-7000-8000-000000000010";
const organizationId = "018e5a3e-0000-7000-8000-000000000099";

describe("cron-job-service", () => {
  beforeEach(() => {
    state.cronJob = null;
    state.service = null;
    state.listRows = [];
    state.runRows = [];
    state.inserted = [];
    state.updates = [];
    state.deletes = [];
    enqueueJobMock.mockClear();
  });

  describe("createCronJob", () => {
    it("inserts the job with the given fields", async () => {
      const row = await createCronJob({ serviceId, name: "Migrate", command: "php artisan migrate", cronExpression: "0 3 * * *" });
      expect(row.name).toBe("Migrate");
      expect(state.inserted).toHaveLength(1);
      expect(state.inserted[0].values).toMatchObject({ serviceId, command: "php artisan migrate", cronExpression: "0 3 * * *" });
    });
  });

  describe("updateCronJob", () => {
    it("throws NotFoundError when the job doesn't exist", async () => {
      await expect(
        updateCronJob(organizationId, { id: cronJobId, name: "New name", command: "echo hi", cronExpression: "* * * * *" }),
      ).rejects.toThrow("Cron job not found");
    });

    it("throws NotFoundError when the job's service isn't in the caller's org", async () => {
      state.cronJob = { id: cronJobId, serviceId };
      state.service = null;
      await expect(
        updateCronJob(organizationId, { id: cronJobId, name: "New name", command: "echo hi", cronExpression: "* * * * *" }),
      ).rejects.toThrow("Cron job not found");
    });

    it("updates name, command, and cronExpression when everything checks out", async () => {
      state.cronJob = { id: cronJobId, serviceId };
      state.service = { id: serviceId };

      const row = await updateCronJob(organizationId, {
        id: cronJobId,
        name: "Nightly migrate",
        command: "php artisan migrate --force",
        cronExpression: "0 3 * * *",
      });

      expect(row.name).toBe("Nightly migrate");
      expect(state.updates).toEqual([
        { name: "Nightly migrate", command: "php artisan migrate --force", cronExpression: "0 3 * * *" },
      ]);
    });
  });

  describe("listCronJobs", () => {
    it("returns the rows for the service", async () => {
      state.listRows = [{ id: cronJobId, name: "Migrate" }];
      await expect(listCronJobs(serviceId)).resolves.toEqual(state.listRows);
    });
  });

  describe("setCronJobEnabled", () => {
    it("throws NotFoundError when the job doesn't exist", async () => {
      await expect(setCronJobEnabled(organizationId, cronJobId, false)).rejects.toThrow("Cron job not found");
    });

    it("throws NotFoundError when the job's service isn't in the caller's org", async () => {
      state.cronJob = { id: cronJobId, serviceId };
      state.service = null;
      await expect(setCronJobEnabled(organizationId, cronJobId, false)).rejects.toThrow("Cron job not found");
    });

    it("updates isEnabled when everything checks out", async () => {
      state.cronJob = { id: cronJobId, serviceId };
      state.service = { id: serviceId };
      await setCronJobEnabled(organizationId, cronJobId, false);
      expect(state.updates).toEqual([{ isEnabled: false }]);
    });
  });

  describe("deleteCronJob", () => {
    it("throws NotFoundError when the job doesn't exist", async () => {
      await expect(deleteCronJob(organizationId, cronJobId)).rejects.toThrow("Cron job not found");
    });

    it("deletes when everything checks out", async () => {
      state.cronJob = { id: cronJobId, serviceId };
      state.service = { id: serviceId };
      await deleteCronJob(organizationId, cronJobId);
      expect(state.deletes).toHaveLength(1);
    });
  });

  describe("triggerCronJobNow", () => {
    it("throws NotFoundError when the job doesn't exist", async () => {
      await expect(triggerCronJobNow(organizationId, cronJobId)).rejects.toThrow("Cron job not found");
      expect(enqueueJobMock).not.toHaveBeenCalled();
    });

    it("rejects triggering a job that is already running", async () => {
      state.cronJob = { id: cronJobId, serviceId, lastRunStatus: "running" };
      state.service = { id: serviceId };
      await expect(triggerCronJobNow(organizationId, cronJobId)).rejects.toThrow(/already running/);
      expect(enqueueJobMock).not.toHaveBeenCalled();
    });

    it("claims the job and enqueues a run when idle", async () => {
      state.cronJob = { id: cronJobId, serviceId, lastRunStatus: "success" };
      state.service = { id: serviceId };

      await triggerCronJobNow(organizationId, cronJobId);

      expect(state.updates).toEqual([{ lastRunStatus: "running" }]);
      expect(enqueueJobMock).toHaveBeenCalledWith(JOB_RUN_CRON_JOB, { cronJobId });
    });

    it("allows triggering a job that has never run", async () => {
      state.cronJob = { id: cronJobId, serviceId, lastRunStatus: null };
      state.service = { id: serviceId };

      await triggerCronJobNow(organizationId, cronJobId);

      expect(enqueueJobMock).toHaveBeenCalledWith(JOB_RUN_CRON_JOB, { cronJobId });
    });
  });

  describe("listCronJobRuns", () => {
    it("throws NotFoundError when the job doesn't exist", async () => {
      await expect(listCronJobRuns(organizationId, cronJobId)).rejects.toThrow("Cron job not found");
    });

    it("throws NotFoundError when the job's service isn't in the caller's org", async () => {
      state.cronJob = { id: cronJobId, serviceId };
      state.service = null;
      await expect(listCronJobRuns(organizationId, cronJobId)).rejects.toThrow("Cron job not found");
    });

    it("returns the run rows once org ownership is confirmed", async () => {
      state.cronJob = { id: cronJobId, serviceId };
      state.service = { id: serviceId };
      state.runRows = [{ id: "run-1", command: "php artisan migrate", status: "success", output: "ok" }];

      await expect(listCronJobRuns(organizationId, cronJobId)).resolves.toEqual(state.runRows);
    });
  });
});
