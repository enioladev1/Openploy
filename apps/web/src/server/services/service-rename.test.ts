import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { updated: [] as Array<{ id: string; name: string }> };

const setMock = vi.fn(() => ({ where: () => ({ returning: async () => state.updated }) }));
const updateMock = vi.fn(() => ({ set: setMock }));

vi.mock("../db", () => ({ db: { update: updateMock } }));

const { renameService } = await import("./service-rename");

describe("renameService", () => {
  beforeEach(() => {
    state.updated = [];
    updateMock.mockClear();
    setMock.mockClear();
  });

  it("throws NotFoundError when the service doesn't exist", async () => {
    await expect(renameService({ serviceId: "missing-id", name: "New name" })).rejects.toThrow("Service not found");
  });

  it("updates and returns the renamed service", async () => {
    state.updated = [{ id: "svc-1", name: "New name" }];
    const result = await renameService({ serviceId: "svc-1", name: "New name" });
    expect(result).toEqual({ id: "svc-1", name: "New name" });
    expect(setMock).toHaveBeenCalledWith({ name: "New name" });
  });
});
