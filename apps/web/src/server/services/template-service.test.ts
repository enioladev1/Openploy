import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  project: { id: "project-1" } as any,
  existingServiceNames: [] as string[],
};

// Bare vi.fn() (no implementation given) infers the permissive
// Mock<(...args: any[]) => any> type, which a spread of `args: any[]` can
// pass back into - and the closures below (not a direct reference) defer
// accessing these consts until call time, past vi.mock's hoisting.
const getOrgScopedProjectMock = vi.fn();
vi.mock("@openploy/db", () => ({
  getOrgScopedProject: (...args: any[]) => getOrgScopedProjectMock(...args),
  services: { projectId: "projectId" },
}));
getOrgScopedProjectMock.mockImplementation(async () => state.project);

const servicesFindManyMock = vi.fn();
vi.mock("../db", () => ({
  db: { query: { services: { findMany: (...args: any[]) => servicesFindManyMock(...args) } } },
}));
servicesFindManyMock.mockImplementation(async () => state.existingServiceNames.map((name) => ({ name })));

const createComposeServiceShellMock = vi.fn();
const setComposeSourceMock = vi.fn();
const setExposedInnerServiceMock = vi.fn();
vi.mock("./compose-service", () => ({
  createComposeServiceShell: (...args: any[]) => createComposeServiceShellMock(...args),
  setComposeSource: (...args: any[]) => setComposeSourceMock(...args),
  setExposedInnerService: (...args: any[]) => setExposedInnerServiceMock(...args),
}));
createComposeServiceShellMock.mockImplementation(async (_org: string, _user: string, input: any) => ({
  id: "service-1",
  name: input.name,
}));
setComposeSourceMock.mockImplementation(async () => ({}));
setExposedInnerServiceMock.mockImplementation(async () => ({}));

const generateNipIoDomainMock = vi.fn();
vi.mock("./domain-service", () => ({
  generateNipIoDomain: (...args: any[]) => generateNipIoDomainMock(...args),
}));
generateNipIoDomainMock.mockImplementation(async () => ({ id: "domain-1", host: "n8n-abc123-1-2-3-4.nip.io" }));

const setEnvVarsBulkMock = vi.fn();
vi.mock("./env-var-service", () => ({
  setEnvVarsBulk: (...args: any[]) => setEnvVarsBulkMock(...args),
}));
setEnvVarsBulkMock.mockImplementation(async () => undefined);

const { deployTemplate } = await import("./template-service");

describe("deployTemplate", () => {
  beforeEach(() => {
    state.project = { id: "project-1" };
    state.existingServiceNames = [];
    getOrgScopedProjectMock.mockClear();
    servicesFindManyMock.mockClear();
    createComposeServiceShellMock.mockClear();
    setComposeSourceMock.mockClear();
    setExposedInnerServiceMock.mockClear();
    generateNipIoDomainMock.mockClear();
    setEnvVarsBulkMock.mockClear();
  });

  it("throws when the project isn't found (or isn't in this org)", async () => {
    state.project = null;
    await expect(deployTemplate("org-1", "user-1", { projectId: "project-1", templateId: "n8n" })).rejects.toThrow(
      "Project not found",
    );
  });

  it("creates the compose shell named after the template id when it's not already taken", async () => {
    await deployTemplate("org-1", "user-1", { projectId: "project-1", templateId: "excalidraw" });
    expect(createComposeServiceShellMock).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      { projectId: "project-1", name: "excalidraw" },
      "excalidraw",
    );
  });

  it("appends -2 when the plain template id is already used in this project", async () => {
    state.existingServiceNames = ["excalidraw"];
    await deployTemplate("org-1", "user-1", { projectId: "project-1", templateId: "excalidraw" });
    expect(createComposeServiceShellMock).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      { projectId: "project-1", name: "excalidraw-2" },
      "excalidraw",
    );
  });

  it("generates the nip.io domain targeting the template's exposed port", async () => {
    await deployTemplate("org-1", "user-1", { projectId: "project-1", templateId: "n8n" });
    expect(generateNipIoDomainMock).toHaveBeenCalledWith({ serviceId: "service-1", targetPort: 5678, enableTls: true });
  });

  it("resolves N8N_HOST to the generated domain's host, and keeps its fixed-value env vars as given", async () => {
    await deployTemplate("org-1", "user-1", { projectId: "project-1", templateId: "n8n" });
    expect(setEnvVarsBulkMock).toHaveBeenCalledWith("org-1", "user-1", {
      serviceId: "service-1",
      scope: "runtime",
      entries: [
        { key: "N8N_HOST", value: "n8n-abc123-1-2-3-4.nip.io" },
        { key: "N8N_PORT", value: "5678" },
        { key: "GENERIC_TIMEZONE", value: "Europe/Berlin" },
      ],
    });
  });

  it("sets phpMyAdmin's DB connection env vars to blank strings for the user to fill in", async () => {
    await deployTemplate("org-1", "user-1", { projectId: "project-1", templateId: "phpmyadmin" });
    expect(setEnvVarsBulkMock).toHaveBeenCalledWith("org-1", "user-1", {
      serviceId: "service-1",
      scope: "runtime",
      entries: [
        { key: "PMA_HOST", value: "" },
        { key: "PMA_USER", value: "" },
        { key: "PMA_PASSWORD", value: "" },
      ],
    });
  });

  it("skips the env var bulk-set entirely for a template with none (excalidraw)", async () => {
    await deployTemplate("org-1", "user-1", { projectId: "project-1", templateId: "excalidraw" });
    expect(setEnvVarsBulkMock).not.toHaveBeenCalled();
  });

  it("sets the compose source and exposed inner service from the template", async () => {
    await deployTemplate("org-1", "user-1", { projectId: "project-1", templateId: "phpmyadmin" });
    expect(setComposeSourceMock).toHaveBeenCalledWith("org-1", {
      serviceId: "service-1",
      sourceType: "raw",
      rawComposeContent: expect.stringContaining("phpmyadmin/phpmyadmin:5.2.1"),
    });
    expect(setExposedInnerServiceMock).toHaveBeenCalledWith("service-1", "phpmyadmin");
  });

  it("never triggers a deployment - the user deploys manually once they've reviewed it", async () => {
    const result = await deployTemplate("org-1", "user-1", { projectId: "project-1", templateId: "n8n" });
    expect(result).toEqual({ id: "service-1", name: "n8n" });
  });
});
