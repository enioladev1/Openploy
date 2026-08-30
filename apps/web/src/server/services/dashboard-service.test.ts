import { describe, expect, it, vi } from "vitest";

const state = {
  statsRows: [] as Array<Record<string, number>>,
  containerRows: [] as Array<{ id: string; name: string; since: Date }>,
};

function chain(): Record<string, unknown> {
  const link: Record<string, unknown> = {
    select: () => link,
    from: () => link,
    leftJoin: () => link,
    innerJoin: () => link,
    where: () => link,
    orderBy: async () => state.containerRows,
    then: (resolve: (value: unknown) => void) => resolve(state.statsRows),
  };
  return link;
}

vi.mock("../db", () => ({ db: chain() }));

const { getDashboardStats, getRunningContainers } = await import("./dashboard-service");

describe("getDashboardStats", () => {
  it("defaults every count to 0 for an org with no projects", async () => {
    state.statsRows = [];
    const stats = await getDashboardStats("org-1");
    expect(stats).toEqual({
      projectCount: 0,
      applicationCount: 0,
      databaseCount: 0,
      composeCount: 0,
      serviceCount: 0,
      runningCount: 0,
    });
  });

  it("sums application/database/compose counts into serviceCount", async () => {
    state.statsRows = [{ projectCount: 3, applicationCount: 2, databaseCount: 1, composeCount: 1, runningCount: 2 }];
    const stats = await getDashboardStats("org-1");
    expect(stats.serviceCount).toBe(4);
    expect(stats.projectCount).toBe(3);
    expect(stats.runningCount).toBe(2);
  });
});

describe("getRunningContainers", () => {
  it("returns an empty list for an org with nothing running", async () => {
    state.containerRows = [];
    const result = await getRunningContainers("org-1");
    expect(result).toEqual([]);
  });

  it("returns the running services with their name and since timestamp", async () => {
    const since = new Date("2026-01-01T00:00:00Z");
    state.containerRows = [{ id: "svc-1", name: "api", since }];
    const result = await getRunningContainers("org-1");
    expect(result).toEqual([{ id: "svc-1", name: "api", since }]);
  });
});
