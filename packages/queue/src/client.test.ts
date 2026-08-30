import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInstances: MockPgBoss[] = [];

type WorkHandler = (jobs: Array<{ id: string; name: string; data: unknown; expireInSeconds: number }>) => Promise<unknown>;

class MockPgBoss {
  createQueue = vi.fn(async (_name: string, _options?: object) => {});
  updateQueue = vi.fn(async (_name: string, _options?: object) => {});
  send = vi.fn(async (_name: string, _data: object, _options?: object) => "job-id-123");
  work = vi.fn(async (_name: string, _handler: WorkHandler) => "worker-id-123");
  start = vi.fn(async () => this);
  on = vi.fn();
  constructor(public opts: unknown) {
    mockInstances.push(this);
  }
}

vi.mock("pg-boss", () => ({ default: MockPgBoss }));

beforeEach(() => {
  mockInstances.length = 0;
  vi.resetModules();
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
});

describe("getBoss", () => {
  it("constructs and starts a PgBoss instance on first call", async () => {
    const { getBoss } = await import("./client");
    const boss = (await getBoss()) as unknown as MockPgBoss;
    expect(mockInstances).toHaveLength(1);
    expect(boss.start).toHaveBeenCalledOnce();
  });

  it("reuses the same instance on subsequent calls (singleton)", async () => {
    const { getBoss } = await import("./client");
    const first = await getBoss();
    const second = await getBoss();
    expect(first).toBe(second);
    expect(mockInstances).toHaveLength(1);
  });

  it("throws if DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL;
    const { getBoss } = await import("./client");
    await expect(getBoss()).rejects.toThrow(/DATABASE_URL/);
  });
});

describe("enqueueJob", () => {
  it("ensures the queue exists, then sends the job", async () => {
    const { enqueueJob } = await import("./client");
    const id = await enqueueJob("deploy-application", { deploymentId: "abc" });

    expect(id).toBe("job-id-123");
    const boss = mockInstances[0]!;
    expect(boss.createQueue).toHaveBeenCalledWith("deploy-application");
    expect(boss.send).toHaveBeenCalledWith("deploy-application", { deploymentId: "abc" }, {});
  });

  it("passes startAfter through to pg-boss when a delay is requested", async () => {
    const { enqueueJob } = await import("./client");
    await enqueueJob("check-certificate-status", { certificateId: "cert-1" }, { startAfterSeconds: 30 });

    const boss = mockInstances[0]!;
    expect(boss.send).toHaveBeenCalledWith("check-certificate-status", { certificateId: "cert-1" }, { startAfter: 30 });
  });

  it("only calls createQueue once across repeated enqueues of the same job name", async () => {
    const { enqueueJob } = await import("./client");
    await enqueueJob("deploy-application", { deploymentId: "a" });
    await enqueueJob("deploy-application", { deploymentId: "b" });

    const boss = mockInstances[0]!;
    expect(boss.createQueue).toHaveBeenCalledOnce();
    expect(boss.send).toHaveBeenCalledTimes(2);
  });
});

describe("registerJobWorker", () => {
  it("wires the handler to be called once per job in a batch", async () => {
    const { registerJobWorker } = await import("./client");
    const handler = vi.fn(async () => {});

    await registerJobWorker("deploy-application", handler);

    const boss = mockInstances[0]!;
    expect(boss.work).toHaveBeenCalledOnce();
    const [, workCallback] = boss.work.mock.calls[0]!;

    await workCallback([
      { id: "1", name: "deploy-application", data: { deploymentId: "a" }, expireInSeconds: 60 },
      { id: "2", name: "deploy-application", data: { deploymentId: "b" }, expireInSeconds: 60 },
    ]);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith({ deploymentId: "a" });
    expect(handler).toHaveBeenCalledWith({ deploymentId: "b" });
  });

  it("does not touch queue expiration when no queueOptions are given", async () => {
    const { registerJobWorker } = await import("./client");
    await registerJobWorker("check-certificate-status", vi.fn());

    const boss = mockInstances[0]!;
    expect(boss.createQueue).toHaveBeenCalledWith("check-certificate-status");
    expect(boss.updateQueue).not.toHaveBeenCalled();
  });

  it("creates and updates the queue with a longer expiry for build-type jobs", async () => {
    const { registerJobWorker } = await import("./client");
    await registerJobWorker("deploy-application", vi.fn(), { expireInHours: 4 });

    const boss = mockInstances[0]!;
    expect(boss.createQueue).toHaveBeenCalledWith("deploy-application", { name: "deploy-application", expireInHours: 4 });
    // Also updates, not just creates - createQueue is a no-op ON CONFLICT for
    // a queue that already existed (e.g. from before this option was added).
    expect(boss.updateQueue).toHaveBeenCalledWith("deploy-application", { name: "deploy-application", expireInHours: 4 });
  });
});
