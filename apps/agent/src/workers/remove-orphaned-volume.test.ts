import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  existingService: undefined as { id: string } | undefined,
  removeVolumeImpl: vi.fn(async (_name: string) => undefined),
  enqueued: [] as Array<{ name: string; data: unknown; options: unknown }>,
  checkDiskUsageCalls: 0,
};

vi.mock("@openploy/docker", () => ({
  removeVolume: (name: string) => state.removeVolumeImpl(name),
}));

vi.mock("@openploy/queue", () => ({
  enqueueJob: vi.fn(async (name: string, data: unknown, options: unknown) => {
    state.enqueued.push({ name, data, options });
  }),
}));

vi.mock("../db", () => ({
  db: {
    query: {
      services: {
        findFirst: vi.fn(async () => state.existingService),
      },
    },
  },
}));

vi.mock("./check-disk-usage", () => ({
  processCheckDiskUsageJob: vi.fn(async () => {
    state.checkDiskUsageCalls += 1;
  }),
}));

const { processRemoveOrphanedVolumeJob } = await import("./remove-orphaned-volume");

const volumeName = "vol-018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d";

describe("processRemoveOrphanedVolumeJob", () => {
  beforeEach(() => {
    state.existingService = undefined;
    state.enqueued = [];
    state.checkDiskUsageCalls = 0;
    state.removeVolumeImpl = vi.fn(async () => undefined);
  });

  it("refuses to remove a volume whose name doesn't match a known convention", async () => {
    await expect(processRemoveOrphanedVolumeJob({ volumeName: "not-a-service-volume", attempt: 1 })).rejects.toThrow(
      /does not match a known service-volume naming convention/,
    );
    expect(state.removeVolumeImpl).not.toHaveBeenCalled();
  });

  it("refuses to remove a volume whose owning service still exists", async () => {
    state.existingService = { id: "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d" };
    await expect(processRemoveOrphanedVolumeJob({ volumeName, attempt: 1 })).rejects.toThrow(/still exists/);
    expect(state.removeVolumeImpl).not.toHaveBeenCalled();
  });

  it("removes the volume and refreshes the disk-usage snapshot on success", async () => {
    await processRemoveOrphanedVolumeJob({ volumeName, attempt: 1 });
    expect(state.removeVolumeImpl).toHaveBeenCalledWith(volumeName);
    expect(state.checkDiskUsageCalls).toBe(1);
    expect(state.enqueued).toEqual([]);
  });

  it("re-enqueues itself with an incremented attempt when removal fails and attempts remain", async () => {
    state.removeVolumeImpl = vi.fn(async () => {
      throw new Error("(HTTP code 409) conflict - volume is in use");
    });

    await processRemoveOrphanedVolumeJob({ volumeName, attempt: 3 });

    expect(state.enqueued).toHaveLength(1);
    expect(state.enqueued[0]).toMatchObject({
      name: "remove-orphaned-volume",
      data: { volumeName, attempt: 4 },
      options: { startAfterSeconds: 10 },
    });
    expect(state.checkDiskUsageCalls).toBe(0);
  });

  it("throws without re-enqueueing once MAX_ATTEMPTS is reached", async () => {
    state.removeVolumeImpl = vi.fn(async () => {
      throw new Error("(HTTP code 409) conflict - volume is in use");
    });

    await expect(processRemoveOrphanedVolumeJob({ volumeName, attempt: 12 })).rejects.toThrow(/volume is in use/);

    expect(state.enqueued).toEqual([]);
    expect(state.checkDiskUsageCalls).toBe(0);
  });
});
