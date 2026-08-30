import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  services: {} as Record<string, any>,
  inserted: [] as any[],
  updated: [] as any[],
  linkableServiceRows: [] as any[],
};

const encryptSecretMock = vi.fn((value: string) => ({ cipherText: `enc(${value})` }));
const decryptSecretMock = vi.fn((value: any) => value.cipherText?.replace(/^enc\(|\)$/g, "") ?? "decrypted");

vi.mock("@openploy/crypto", () => ({
  encryptSecret: (value: string) => encryptSecretMock(value),
  decryptSecret: (value: any) => decryptSecretMock(value),
}));

const envVarsFindFirstMock = vi.fn();
const envVarsFindManyMock = vi.fn();
const servicesFindManyMock = vi.fn();

vi.mock("../db", () => ({
  db: {
    query: {
      environmentVariables: {
        findFirst: (...args: any[]) => envVarsFindFirstMock(...args),
        findMany: (...args: any[]) => envVarsFindManyMock(...args),
      },
      services: {
        findMany: (...args: any[]) => servicesFindManyMock(...args),
      },
    },
    insert: vi.fn((_table: any) => ({
      values: (values: any) => ({
        returning: async () => {
          const row = { id: "new-env-var-id", ...values };
          state.inserted.push(row);
          return [row];
        },
      }),
    })),
    update: vi.fn((_table: any) => ({
      set: (values: any) => ({
        where: () => ({
          returning: async () => {
            const row = { id: "updated-env-var-id", ...values };
            state.updated.push(row);
            return [row];
          },
        }),
      }),
    })),
    delete: vi.fn(() => ({ where: async () => undefined })),
    select: vi.fn(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: async () => state.linkableServiceRows,
          }),
        }),
      }),
    })),
    transaction: async (fn: any) =>
      fn({
        delete: vi.fn(() => ({ where: async () => undefined })),
        update: vi.fn((_table: any) => ({ set: (values: any) => ({ where: async () => state.updated.push(values) }) })),
        insert: vi.fn((_table: any) => ({ values: async (values: any) => state.inserted.push(values) })),
      }),
  },
}));

vi.mock("@openploy/db", () => ({
  environmentVariables: { id: "id-col", serviceId: "service-id-col", scope: "scope-col", key: "key-col", referencesServiceId: "ref-col" },
  services: { id: "id-col", projectId: "project-id-col", type: "type-col", name: "name-col" },
  databaseServices: { serviceId: "service-id-col", engine: "engine-col" },
  auditLogs: { id: "id-col" },
  getOrgScopedService: vi.fn(async (_db: any, _org: string, serviceId: string) => state.services[serviceId]),
  getServiceScopedEnvVar: vi.fn(),
}));

const { setEnvVar, setEnvVarsBulk, listEnvVars, listLinkableServices } = await import("./env-var-service");

const organizationId = "018e5a3e-0000-7000-8000-000000000099";
const appServiceId = "018e5a3e-0000-7000-8000-0000000000a1";
const dbServiceId = "018e5a3e-0000-7000-8000-0000000000b1";
const otherProjectDbServiceId = "018e5a3e-0000-7000-8000-0000000000c1";

describe("setEnvVar with kind: reference", () => {
  beforeEach(() => {
    state.services = {
      [appServiceId]: { id: appServiceId, projectId: "project-1", type: "application" },
      [dbServiceId]: { id: dbServiceId, projectId: "project-1", type: "database" },
      [otherProjectDbServiceId]: { id: otherProjectDbServiceId, projectId: "project-2", type: "database" },
    };
    state.inserted = [];
    state.updated = [];
    envVarsFindFirstMock.mockReset().mockResolvedValue(null);
  });

  it("rejects linking to a service in a different project", async () => {
    await expect(
      setEnvVar(organizationId, "user-1", {
        kind: "reference",
        serviceId: appServiceId,
        key: "DB_URL",
        referencesServiceId: otherProjectDbServiceId,
        referencesField: "connection_string",
        scope: "runtime",
      }),
    ).rejects.toThrow(/same project/);
    expect(state.inserted).toHaveLength(0);
  });

  it("rejects linking to a non-database service", async () => {
    const anotherAppId = "018e5a3e-0000-7000-8000-0000000000d1";
    state.services[anotherAppId] = { id: anotherAppId, projectId: "project-1", type: "application" };

    await expect(
      setEnvVar(organizationId, "user-1", {
        kind: "reference",
        serviceId: appServiceId,
        key: "DB_URL",
        referencesServiceId: anotherAppId,
        referencesField: "connection_string",
        scope: "runtime",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects when the referenced service isn't in the caller's org", async () => {
    await expect(
      setEnvVar(organizationId, "user-1", {
        kind: "reference",
        serviceId: appServiceId,
        key: "DB_URL",
        referencesServiceId: "not-in-org",
        referencesField: "connection_string",
        scope: "runtime",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("creates a reference row with no stored value, forced isSecret", async () => {
    const row = await setEnvVar(organizationId, "user-1", {
      kind: "reference",
      serviceId: appServiceId,
      key: "DB_URL",
      referencesServiceId: dbServiceId,
      referencesField: "connection_string",
      scope: "runtime",
    });

    expect(row).toMatchObject({
      valueEncrypted: null,
      isSecret: true,
      referencesServiceId: dbServiceId,
      referencesField: "connection_string",
    });
    expect(encryptSecretMock).not.toHaveBeenCalled();
  });
});

describe("setEnvVar with kind: value", () => {
  beforeEach(() => {
    state.services = { [appServiceId]: { id: appServiceId, projectId: "project-1", type: "application" } };
    state.inserted = [];
    envVarsFindFirstMock.mockReset().mockResolvedValue(null);
    encryptSecretMock.mockClear();
  });

  it("encrypts the value and clears any reference fields", async () => {
    const row = await setEnvVar(organizationId, "user-1", {
      kind: "value",
      serviceId: appServiceId,
      key: "PORT",
      value: "3000",
      isSecret: false,
      scope: "runtime",
    });

    expect(encryptSecretMock).toHaveBeenCalledWith("3000");
    expect(row).toMatchObject({ referencesServiceId: null, referencesField: null, isSecret: false });
  });
});

describe("setEnvVarsBulk", () => {
  beforeEach(() => {
    envVarsFindManyMock.mockReset();
    state.updated = [];
    state.inserted = [];
  });

  it("rejects when a textarea key collides with an existing linked variable's key", async () => {
    envVarsFindManyMock
      .mockResolvedValueOnce([]) // plain existingRows
      .mockResolvedValueOnce([{ id: "linked-1", key: "DB_URL", referencesServiceId: dbServiceId }]); // linkedRows

    await expect(
      setEnvVarsBulk(organizationId, "user-1", {
        serviceId: appServiceId,
        scope: "runtime",
        entries: [{ key: "DB_URL", value: "postgres://should-not-be-allowed" }],
      }),
    ).rejects.toThrow(/linked to another service/);
  });

  it("does not touch linked rows when saving plain entries", async () => {
    envVarsFindManyMock
      .mockResolvedValueOnce([{ id: "plain-1", key: "OLD_KEY" }]) // plain existingRows - not in next entries, should be deleted
      .mockResolvedValueOnce([]); // no linked rows

    await setEnvVarsBulk(organizationId, "user-1", {
      serviceId: appServiceId,
      scope: "runtime",
      entries: [{ key: "NEW_KEY", value: "hello" }],
    });

    const envVarInserts = state.inserted.filter((v) => "key" in v);
    expect(envVarInserts).toHaveLength(1);
    expect(envVarInserts[0]).toMatchObject({ key: "NEW_KEY" });
  });
});

describe("listEnvVars", () => {
  it("resolves the referenced service's name for linked rows", async () => {
    envVarsFindManyMock.mockResolvedValueOnce([
      { id: "1", key: "PORT", isSecret: false, scope: "runtime", referencesServiceId: null, referencesField: null },
      { id: "2", key: "DB_URL", isSecret: true, scope: "runtime", referencesServiceId: dbServiceId, referencesField: "connection_string" },
    ]);
    servicesFindManyMock.mockResolvedValueOnce([{ id: dbServiceId, name: "redis" }]);

    const rows = await listEnvVars(appServiceId);

    expect(rows.find((r) => r.key === "DB_URL")).toMatchObject({
      referencesServiceId: dbServiceId,
      referencesServiceName: "redis",
      referencesField: "connection_string",
    });
    expect(rows.find((r) => r.key === "PORT")).toMatchObject({ referencesServiceId: null, referencesServiceName: null });
  });
});

describe("listLinkableServices", () => {
  beforeEach(() => {
    state.services = { [appServiceId]: { id: appServiceId, projectId: "project-1", type: "application" } };
    state.linkableServiceRows = [];
  });

  it("returns only database services in the same project, including engine", async () => {
    state.linkableServiceRows = [{ id: dbServiceId, name: "redis", engine: "redis" }];

    const result = await listLinkableServices(organizationId, appServiceId);

    expect(result).toEqual([{ id: dbServiceId, name: "redis", engine: "redis" }]);
  });

  it("throws when the pointing service isn't in the caller's org", async () => {
    await expect(listLinkableServices(organizationId, "unknown-service")).rejects.toThrow(/not found/i);
  });
});
