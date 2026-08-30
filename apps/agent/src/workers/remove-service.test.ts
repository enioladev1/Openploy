import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  volumes: [] as Array<{ name: string; sizeBytes: number; refCount: number }>,
  enqueued: [] as Array<{ name: string; data: unknown; options: unknown }>,
};

vi.mock("@openploy/docker", () => ({
  removeService: vi.fn(async () => undefined),
  removeStack: vi.fn(async () => undefined),
  listVolumesWithUsage: vi.fn(async () => state.volumes),
}));

vi.mock("@openploy/traefik", () => ({
  removeDomainConfig: vi.fn(async () => undefined),
}));

vi.mock("../runtime-logs", () => ({
  stopRuntimeLogTail: vi.fn(),
}));

vi.mock("@openploy/queue", () => ({
  enqueueJob: vi.fn(async (name: string, data: unknown, options: unknown) => {
    state.enqueued.push({ name, data, options });
  }),
}));

const { processRemoveServiceJob } = await import("./remove-service");

const baseJob = {
  serviceId: "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d",
  dockerTarget: null as string | null,
  domainIds: [] as string[],
  deleteVolumes: false,
};

describe("processRemoveServiceJob volume cleanup", () => {
  beforeEach(() => {
    state.volumes = [];
    state.enqueued = [];
  });

  it("does nothing when deleteVolumes is false", async () => {
    await processRemoveServiceJob({ ...baseJob, serviceType: "database", deleteVolumes: false });
    expect(state.enqueued).toEqual([]);
  });

  it("enqueues a durable removal job for the single deterministic volume of a database service", async () => {
    await processRemoveServiceJob({ ...baseJob, serviceType: "database", deleteVolumes: true });
    expect(state.enqueued).toHaveLength(1);
    expect(state.enqueued[0]).toMatchObject({
      name: "remove-orphaned-volume",
      data: { volumeName: `vol-${baseJob.serviceId}`, attempt: 1 },
    });
  });

  it("never enqueues a volume removal for an application service", async () => {
    await processRemoveServiceJob({ ...baseJob, serviceType: "application", deleteVolumes: true });
    expect(state.enqueued).toEqual([]);
  });

  it("enqueues a removal job for every volume whose name is prefixed by the compose stack name, ignoring unrelated volumes", async () => {
    const prefix = `stack-${baseJob.serviceId}_`;
    state.volumes = [
      { name: `${prefix}postgres_data`, sizeBytes: 1, refCount: 0 },
      { name: `${prefix}redis_data`, sizeBytes: 1, refCount: 0 },
      { name: "some_unrelated_volume", sizeBytes: 1, refCount: 0 },
      { name: "vol-018e5a3e-0000-7000-8000-000000000000", sizeBytes: 1, refCount: 0 },
    ];

    await processRemoveServiceJob({ ...baseJob, serviceType: "compose", deleteVolumes: true });

    const names = state.enqueued.map((job) => (job.data as { volumeName: string }).volumeName).sort();
    expect(names).toEqual([`${prefix}postgres_data`, `${prefix}redis_data`].sort());
  });
});
