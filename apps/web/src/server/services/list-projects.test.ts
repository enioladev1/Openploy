import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  projectRows: [] as any[],
  serviceRows: [] as any[],
  selectCallCount: 0,
};

function chain(rows: any[], awaitableAtWhere: boolean): Record<string, unknown> {
  const link: Record<string, unknown> = {
    from: () => link,
    leftJoin: () => link,
    where: () => link,
    groupBy: () => link,
    orderBy: async () => rows,
  };
  if (awaitableAtWhere) {
    link.then = (resolve: (value: unknown) => void) => resolve(rows);
  }
  return link;
}

const selectMock = vi.fn(() => {
  state.selectCallCount += 1;
  return state.selectCallCount === 1 ? chain(state.projectRows, false) : chain(state.serviceRows, true);
});

vi.mock("../db", () => ({ db: { select: selectMock } }));

vi.mock("@openploy/db", () => ({
  projects: { id: "id-col", organizationId: "org-id-col", createdAt: "created-at-col" },
  services: { id: "id-col", projectId: "project-id-col", type: "type-col" },
  databaseServices: { serviceId: "service-id-col", engine: "engine-col" },
}));

const { listProjects } = await import("./project-service");

describe("listProjects", () => {
  beforeEach(() => {
    state.projectRows = [];
    state.serviceRows = [];
    state.selectCallCount = 0;
    selectMock.mockClear();
  });

  it("returns an empty array without querying services when there are no projects", async () => {
    const result = await listProjects("org-1");
    expect(result).toEqual([]);
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("attaches every service (with its engine) present in each project", async () => {
    state.projectRows = [
      { id: "proj-1", name: "A", serviceCount: 2 },
      { id: "proj-2", name: "B", serviceCount: 1 },
    ];
    state.serviceRows = [
      { projectId: "proj-1", id: "svc-1", type: "application", engine: null },
      { projectId: "proj-1", id: "svc-2", type: "database", engine: "redis" },
      { projectId: "proj-2", id: "svc-3", type: "database", engine: "mysql" },
    ];

    const result = await listProjects("org-1");

    expect(result.find((p) => p.id === "proj-1")?.services).toEqual([
      { projectId: "proj-1", id: "svc-1", type: "application", engine: null },
      { projectId: "proj-1", id: "svc-2", type: "database", engine: "redis" },
    ]);
    expect(result.find((p) => p.id === "proj-2")?.services).toEqual([
      { projectId: "proj-2", id: "svc-3", type: "database", engine: "mysql" },
    ]);
  });

  it("gives a project with no services an empty services array", async () => {
    state.projectRows = [{ id: "proj-1", name: "A", serviceCount: 0 }];
    state.serviceRows = [];
    const result = await listProjects("org-1");
    expect(result[0]?.services).toEqual([]);
  });
});
