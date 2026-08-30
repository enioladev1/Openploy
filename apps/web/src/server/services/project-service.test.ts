import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeProject {
  id: string;
  organizationId: string;
}
interface FakeService {
  id: string;
}

const state = {
  project: null as FakeProject | null,
  projectServices: [] as FakeService[],
  latestDeployments: [] as { serviceId: string; status: string }[],
  domainRows: [] as { id: string; serviceId: string; host: string; certificateStatus: string | null }[],
  engineRows: [] as { serviceId: string; engine: string }[],
};

const deleteMock = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
const selectDistinctOnMock = vi.fn(() => ({
  from: () => ({
    where: () => ({
      orderBy: async () => state.latestDeployments,
    }),
  }),
}));
// domains vs databaseServices are distinguished by a marker property on the
// stub table object below - a plain mock can't otherwise tell which table a
// generic .select().from(table).where() call is for.
const selectMock = vi.fn(() => ({
  from: (table: { __marker: string }) => {
    const resolve = async () => (table.__marker === "domains" ? state.domainRows : state.engineRows);
    // Only the domains query chains .leftJoin(certificates, ...) before .where() -
    // supporting both shapes here keeps one mock usable for both queries.
    return { leftJoin: () => ({ where: resolve }), where: resolve };
  },
}));

vi.mock("../db", () => ({
  db: {
    query: {
      projects: { findFirst: vi.fn(async () => state.project) },
      services: { findMany: vi.fn(async () => state.projectServices) },
    },
    delete: deleteMock,
    selectDistinctOn: selectDistinctOnMock,
    select: selectMock,
  },
}));

vi.mock("@openploy/db", () => ({
  domains: { __marker: "domains", id: "id-col", serviceId: "service-id-col", host: "host-col", certificateId: "cert-id-col" },
  certificates: { id: "id-col", status: "status-col" },
  databaseServices: { __marker: "databaseServices", serviceId: "service-id-col", engine: "engine-col" },
  deployments: { serviceId: "service-id-col", status: "status-col", createdAt: "created-at-col" },
  environmentVariables: { serviceId: "service-id-col", referencesServiceId: "ref-col" },
  getOrgScopedProject: vi.fn(async () => state.project),
  projects: { id: "id-col" },
  services: { id: "id-col", projectId: "project-id-col" },
}));

const { deleteProject, listServicesForProjectWithDeployStatus } = await import("./project-service");

describe("deleteProject", () => {
  beforeEach(() => {
    state.project = null;
    state.projectServices = [];
    deleteMock.mockClear();
  });

  it("throws NotFoundError when the project doesn't exist (or isn't owned by this org)", async () => {
    await expect(deleteProject("org-1", "missing-project")).rejects.toThrow("Project not found");
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("refuses to delete a project that still has services, naming the count", async () => {
    state.project = { id: "proj-1", organizationId: "org-1" };
    state.projectServices = [{ id: "svc-1" }, { id: "svc-2" }];

    await expect(deleteProject("org-1", "proj-1")).rejects.toThrow(/2 services/);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("uses singular wording for exactly one remaining service", async () => {
    state.project = { id: "proj-1", organizationId: "org-1" };
    state.projectServices = [{ id: "svc-1" }];

    await expect(deleteProject("org-1", "proj-1")).rejects.toThrow(/1 service /);
  });

  it("deletes the project once it has no services left", async () => {
    state.project = { id: "proj-1", organizationId: "org-1" };
    state.projectServices = [];

    await deleteProject("org-1", "proj-1");
    expect(deleteMock).toHaveBeenCalledOnce();
  });
});

describe("listServicesForProjectWithDeployStatus", () => {
  beforeEach(() => {
    state.projectServices = [];
    state.latestDeployments = [];
    state.domainRows = [];
    state.engineRows = [];
    selectDistinctOnMock.mockClear();
    selectMock.mockClear();
  });

  it("returns an empty array without querying deployments, domains, or engines when the project has no services", async () => {
    const result = await listServicesForProjectWithDeployStatus("proj-1");
    expect(result).toEqual([]);
    expect(selectDistinctOnMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("marks a service isDeploying when its latest deployment is still in flight", async () => {
    state.projectServices = [{ id: "svc-1" }, { id: "svc-2" }];
    state.latestDeployments = [
      { serviceId: "svc-1", status: "building" },
      { serviceId: "svc-2", status: "success" },
    ];

    const result = await listServicesForProjectWithDeployStatus("proj-1");

    expect(result).toEqual([
      { id: "svc-1", isDeploying: true, domains: [], engine: null },
      { id: "svc-2", isDeploying: false, domains: [], engine: null },
    ]);
  });

  it("attaches each service's domains and, for database services, its engine", async () => {
    state.projectServices = [{ id: "svc-1" }, { id: "svc-2" }];
    state.domainRows = [
      { id: "dom-1", serviceId: "svc-1", host: "app.example.nip.io", certificateStatus: "issued" },
      { id: "dom-2", serviceId: "svc-1", host: "app-alt.example.nip.io", certificateStatus: null },
    ];
    state.engineRows = [{ serviceId: "svc-2", engine: "redis" }];

    const result = await listServicesForProjectWithDeployStatus("proj-1");

    expect(result.find((s) => s.id === "svc-1")).toMatchObject({
      domains: [
        { id: "dom-1", host: "app.example.nip.io", isIssued: true },
        { id: "dom-2", host: "app-alt.example.nip.io", isIssued: false },
      ],
      engine: null,
    });
    expect(result.find((s) => s.id === "svc-2")).toMatchObject({ domains: [], engine: "redis" });
  });

  it.each(["pending", "failed", null])("treats certificateStatus %s as not issued (never links https to a domain with no working cert)", async (certificateStatus) => {
    state.projectServices = [{ id: "svc-1" }];
    state.domainRows = [{ id: "dom-1", serviceId: "svc-1", host: "app.example.nip.io", certificateStatus }];

    const result = await listServicesForProjectWithDeployStatus("proj-1");

    expect(result[0]?.domains).toEqual([{ id: "dom-1", host: "app.example.nip.io", isIssued: false }]);
  });

  it("treats every in-flight deployment status (queued/building/deploying) as isDeploying", async () => {
    state.projectServices = [{ id: "svc-1" }, { id: "svc-2" }, { id: "svc-3" }];
    state.latestDeployments = [
      { serviceId: "svc-1", status: "queued" },
      { serviceId: "svc-2", status: "deploying" },
      { serviceId: "svc-3", status: "failed" },
    ];

    const result = await listServicesForProjectWithDeployStatus("proj-1");

    expect(result.find((s) => s.id === "svc-1")?.isDeploying).toBe(true);
    expect(result.find((s) => s.id === "svc-2")?.isDeploying).toBe(true);
    expect(result.find((s) => s.id === "svc-3")?.isDeploying).toBe(false);
  });

  it("treats a service with no deployments yet as not deploying", async () => {
    state.projectServices = [{ id: "svc-1" }];
    state.latestDeployments = [];

    const result = await listServicesForProjectWithDeployStatus("proj-1");

    expect(result).toEqual([{ id: "svc-1", isDeploying: false, domains: [], engine: null }]);
  });
});
