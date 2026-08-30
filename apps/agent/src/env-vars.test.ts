import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  envVarRows: [] as any[],
  databaseServiceRow: undefined as any,
  secretRow: undefined as any,
};

vi.mock("@openploy/crypto", () => ({
  decryptSecret: vi.fn((value: any) => (typeof value === "string" ? value : `decrypted(${value.cipherText})`)),
}));

vi.mock("@openploy/shared", () => ({
  buildDatabaseConnectionString: vi.fn(
    (engine: string, host: string, port: number, dbName: string, username: string | null, password: string) =>
      `${engine}://${username}:${password}@${host}:${port}/${dbName}`,
  ),
}));

vi.mock("./db", () => ({
  db: {
    query: {
      environmentVariables: { findMany: vi.fn(async () => state.envVarRows) },
      databaseServices: { findFirst: vi.fn(async () => state.databaseServiceRow) },
      secrets: { findFirst: vi.fn(async () => state.secretRow) },
    },
  },
}));

vi.mock("@openploy/db", () => ({
  environmentVariables: { serviceId: "service-id-col" },
  databaseServices: { serviceId: "service-id-col" },
  secrets: { id: "id-col" },
}));

const { loadDecryptedEnvVars } = await import("./env-vars");

const dbServiceId = "018e5a3e-0000-7000-8000-0000000000b1";

describe("loadDecryptedEnvVars", () => {
  beforeEach(() => {
    state.envVarRows = [];
    state.databaseServiceRow = {
      serviceId: dbServiceId,
      engine: "postgres",
      internalHost: "db-abc123",
      internalPort: 5432,
      databaseName: "app",
      username: "app_user",
      credentialsSecretId: "secret-1",
    };
    state.secretRow = { cipherText: "s3cr3t-p4ss" };
  });

  it("decrypts a plain stored value as before", async () => {
    state.envVarRows = [
      {
        key: "PORT",
        valueEncrypted: JSON.stringify({ cipherText: "3000" }),
        isSecret: false,
        scope: "runtime",
        referencesServiceId: null,
        referencesField: null,
      },
    ];

    const result = await loadDecryptedEnvVars("app-service-1");

    expect(result.runtime.PORT).toBe("decrypted(3000)");
    expect(result.secretValues).not.toContain(result.runtime.PORT);
  });

  it("resolves a linked variable's host without touching the credential", async () => {
    state.envVarRows = [
      { key: "DB_HOST", valueEncrypted: null, isSecret: true, scope: "runtime", referencesServiceId: dbServiceId, referencesField: "host" },
    ];

    const result = await loadDecryptedEnvVars("app-service-1");

    expect(result.runtime.DB_HOST).toBe("db-abc123");
  });

  it("resolves a linked variable's connection_string by decrypting the target's credential", async () => {
    state.envVarRows = [
      {
        key: "DATABASE_URL",
        valueEncrypted: null,
        isSecret: true,
        scope: "runtime",
        referencesServiceId: dbServiceId,
        referencesField: "connection_string",
      },
    ];

    const result = await loadDecryptedEnvVars("app-service-1");

    expect(result.runtime.DATABASE_URL).toBe("postgres://app_user:decrypted(s3cr3t-p4ss)@db-abc123:5432/app");
    // Always redacted regardless of isSecret - a link is assumed to expose real credentials.
    expect(result.secretValues).toContain(result.runtime.DATABASE_URL);
  });

  it("throws when the linked database service no longer exists", async () => {
    state.databaseServiceRow = undefined;
    state.envVarRows = [
      { key: "DB_HOST", valueEncrypted: null, isSecret: true, scope: "runtime", referencesServiceId: dbServiceId, referencesField: "host" },
    ];

    await expect(loadDecryptedEnvVars("app-service-1")).rejects.toThrow(/not found/);
  });
});
