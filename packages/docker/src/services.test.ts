import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  tasks: [] as Array<{ CreatedAt?: string; Status?: { State?: string; Timestamp?: string } }>,
  serviceExists: true,
  inspected: {
    Spec: {
      Name: "openploy_web",
      TaskTemplate: { ContainerSpec: { Image: "ghcr.io/enioladev1/openploy-web:latest@sha256:old" } },
    },
    Version: { Index: 7 },
  } as any,
  updateCalls: [] as any[],
};

vi.mock("./client", () => ({
  getDockerClient: () => ({
    listTasks: vi.fn(async () => state.tasks),
    listServices: vi.fn(async ({ filters }: { filters: string }) => {
      if (!state.serviceExists) return [];
      const [name] = JSON.parse(filters).name as string[];
      return [{ ID: "service-id", Spec: { Name: name } }];
    }),
    getService: (id: string) => ({
      inspect: vi.fn(async () => state.inspected),
      update: vi.fn(async (spec: any) => {
        state.updateCalls.push(spec);
      }),
    }),
  }),
}));

const { getServiceImage, getServiceRunningSince, getServiceRunState, updateServiceImage } = await import("./services");

describe("getServiceRunningSince", () => {
  beforeEach(() => {
    state.tasks = [];
  });

  it("returns null when there is no task at all", async () => {
    expect(await getServiceRunningSince("app-1")).toBeNull();
  });

  it("returns null when the latest task isn't running", async () => {
    state.tasks = [{ CreatedAt: "2026-01-01T00:00:00Z", Status: { State: "pending", Timestamp: "2026-01-01T00:00:00Z" } }];
    expect(await getServiceRunningSince("app-1")).toBeNull();
  });

  it("returns the running task's Status.Timestamp as a Date", async () => {
    state.tasks = [
      { CreatedAt: "2026-01-01T00:00:00Z", Status: { State: "running", Timestamp: "2026-01-01T00:05:00Z" } },
    ];
    const since = await getServiceRunningSince("app-1");
    expect(since).toEqual(new Date("2026-01-01T00:05:00Z"));
  });

  it("picks the most recently created task when several exist", async () => {
    state.tasks = [
      { CreatedAt: "2026-01-01T00:00:00Z", Status: { State: "failed", Timestamp: "2026-01-01T00:00:05Z" } },
      { CreatedAt: "2026-01-02T00:00:00Z", Status: { State: "running", Timestamp: "2026-01-02T00:00:10Z" } },
    ];
    const since = await getServiceRunningSince("app-1");
    expect(since).toEqual(new Date("2026-01-02T00:00:10Z"));
  });
});

describe("getServiceRunState", () => {
  beforeEach(() => {
    state.tasks = [];
  });

  it("returns unknown when there is no task", async () => {
    expect(await getServiceRunState("app-1")).toBe("unknown");
  });

  it("returns running/failed/pending from the latest task's state", async () => {
    state.tasks = [{ CreatedAt: "2026-01-01T00:00:00Z", Status: { State: "running" } }];
    expect(await getServiceRunState("app-1")).toBe("running");
  });
});

describe("getServiceImage", () => {
  beforeEach(() => {
    state.serviceExists = true;
    state.inspected.Spec.TaskTemplate.ContainerSpec.Image = "ghcr.io/enioladev1/openploy-web:latest@sha256:old";
  });

  it("returns null when the service doesn't exist", async () => {
    state.serviceExists = false;
    expect(await getServiceImage("openploy_web")).toBeNull();
  });

  it("reads the image straight from the live Swarm spec, not a cache", async () => {
    expect(await getServiceImage("openploy_web")).toBe("ghcr.io/enioladev1/openploy-web:latest@sha256:old");
  });
});

describe("updateServiceImage", () => {
  beforeEach(() => {
    state.serviceExists = true;
    state.updateCalls = [];
    state.inspected = {
      Spec: {
        Name: "openploy_web",
        TaskTemplate: { ContainerSpec: { Image: "ghcr.io/enioladev1/openploy-web:latest@sha256:old" }, ForceUpdate: 2 },
        UpdateConfig: { Order: "stop-first" },
      },
      Version: { Index: 7 },
    };
  });

  it("does nothing when the service doesn't exist", async () => {
    state.serviceExists = false;
    await updateServiceImage("openploy_web", "ghcr.io/enioladev1/openploy-web:latest@sha256:new");
    expect(state.updateCalls).toEqual([]);
  });

  it("swaps only the image, bumps ForceUpdate, and preserves the rest of the spec (e.g. stop-first)", async () => {
    await updateServiceImage("openploy_web", "ghcr.io/enioladev1/openploy-web:latest@sha256:new");

    expect(state.updateCalls).toHaveLength(1);
    const call = state.updateCalls[0];
    expect(call.TaskTemplate.ContainerSpec.Image).toBe("ghcr.io/enioladev1/openploy-web:latest@sha256:new");
    expect(call.TaskTemplate.ForceUpdate).toBe(3);
    expect(call.UpdateConfig).toEqual({ Order: "stop-first" });
    expect(call.version).toBe(7);
  });
});
