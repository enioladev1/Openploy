import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeService {
  id: string;
}

const state = { orgOwnedServices: [] as FakeService[] };

vi.mock("@openploy/db", () => ({
  getOrgScopedServices: vi.fn(async (_db: unknown, _org: string, ids: string[]) =>
    state.orgOwnedServices.filter((s) => ids.includes(s.id)),
  ),
}));

vi.mock("../db", () => ({ db: {} }));

const deleteServiceMock = vi.fn(async () => undefined);
const stopServiceMock = vi.fn(async (id: string) => {
  if (id === "svc-fail") throw new Error("boom");
});
const startServiceMock = vi.fn(async () => undefined);

vi.mock("./service-deletion", () => ({ deleteService: deleteServiceMock }));
vi.mock("./service-lifecycle", () => ({ startService: startServiceMock, stopService: stopServiceMock }));

const { bulkDeleteServices, bulkStartServices, bulkStopServices } = await import("./bulk-service-actions");

describe("bulk service actions", () => {
  beforeEach(() => {
    state.orgOwnedServices = [{ id: "svc-1" }, { id: "svc-2" }, { id: "svc-fail" }];
    deleteServiceMock.mockClear();
    stopServiceMock.mockClear();
    startServiceMock.mockClear();
  });

  it("marks an id not owned by the org as a failed 'not found' result, without calling the action for it", async () => {
    const results = await bulkStopServices("org-1", ["svc-1", "foreign-id"]);
    expect(results).toEqual(
      expect.arrayContaining([
        { serviceId: "svc-1", success: true },
        { serviceId: "foreign-id", success: false, error: "Service not found" },
      ]),
    );
    expect(stopServiceMock).toHaveBeenCalledTimes(1);
    expect(stopServiceMock).toHaveBeenCalledWith("svc-1");
  });

  it("one service failing doesn't stop the rest of the batch from completing", async () => {
    const results = await bulkStopServices("org-1", ["svc-1", "svc-fail", "svc-2"]);
    const byId = Object.fromEntries(results.map((r) => [r.serviceId, r]));

    expect(byId["svc-1"]).toEqual({ serviceId: "svc-1", success: true });
    expect(byId["svc-2"]).toEqual({ serviceId: "svc-2", success: true });
    expect(byId["svc-fail"]).toEqual({ serviceId: "svc-fail", success: false, error: "boom" });
    expect(stopServiceMock).toHaveBeenCalledTimes(3);
  });

  it("bulkDeleteServices passes the org and user through to deleteService per id, deleteVolumes defaulting to false", async () => {
    await bulkDeleteServices("org-1", "user-1", ["svc-1", "svc-2"]);
    expect(deleteServiceMock).toHaveBeenCalledWith("org-1", "user-1", "svc-1", false);
    expect(deleteServiceMock).toHaveBeenCalledWith("org-1", "user-1", "svc-2", false);
  });

  it("bulkDeleteServices threads deleteVolumes: true through to every deleteService call", async () => {
    await bulkDeleteServices("org-1", "user-1", ["svc-1", "svc-2"], true);
    expect(deleteServiceMock).toHaveBeenCalledWith("org-1", "user-1", "svc-1", true);
    expect(deleteServiceMock).toHaveBeenCalledWith("org-1", "user-1", "svc-2", true);
  });

  it("bulkStartServices calls startService per valid id", async () => {
    await bulkStartServices("org-1", ["svc-1", "svc-2"]);
    expect(startServiceMock).toHaveBeenCalledWith("svc-1");
    expect(startServiceMock).toHaveBeenCalledWith("svc-2");
  });
});
