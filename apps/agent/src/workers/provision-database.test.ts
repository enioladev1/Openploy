import { describe, expect, it, vi } from "vitest";

// buildSpec itself is a pure function, but importing the module still
// evaluates its other top-level imports (db client, crypto, docker, etc.),
// which throw without a real DATABASE_URL / real environment - stub them out.
vi.mock("../db", () => ({ db: {} }));
vi.mock("@openploy/db", () => ({ databaseServices: {}, deployments: {}, secrets: {}, services: {} }));
vi.mock("@openploy/crypto", () => ({ decryptSecret: vi.fn() }));
vi.mock("@openploy/docker", () => ({ createOrUpdateService: vi.fn() }));
vi.mock("../log-writer", () => ({ createLogWriter: vi.fn() }));
vi.mock("../redact", () => ({ buildRedactor: vi.fn() }));
vi.mock("../service-lifecycle", () => ({ finalizeServiceRunState: vi.fn() }));

const { buildSpec } = await import("./provision-database");

const creds = { databaseName: "openploy", username: "openploy", password: "secret-password", rootPassword: null };
const resources = { cpuLimit: 1, memoryLimitMb: 512 };

describe("buildSpec", () => {
  it("mounts postgres 18+ at /var/lib/postgresql, not .../data", () => {
    // postgres 18 changed to a pg_ctlcluster-style, version-named data layout
    // and refuses to start (immediate exit 1) if it instead finds an
    // old-style mount directly at .../data - this is the exact bug that took
    // a real database down, so this must never regress silently.
    const spec = buildSpec("postgres", "18", "db-1", "vol-1", creds, resources);
    expect(spec.mounts).toEqual([{ volumeName: "vol-1", targetPath: "/var/lib/postgresql" }]);
  });

  it("mounts postgres 16 and earlier at the old .../data path", () => {
    for (const version of ["16", "15", "14"]) {
      const spec = buildSpec("postgres", version, "db-1", "vol-1", creds, resources);
      expect(spec.mounts).toEqual([{ volumeName: "vol-1", targetPath: "/var/lib/postgresql/data" }]);
    }
  });

  it("leaves mysql, redis, and clickhouse mount paths untouched by the postgres version fix", () => {
    expect(buildSpec("mysql", "8", "db-1", "vol-1", creds, resources).mounts).toEqual([
      { volumeName: "vol-1", targetPath: "/var/lib/mysql" },
    ]);
    expect(buildSpec("redis", "7", "db-1", "vol-1", creds, resources).mounts).toEqual([
      { volumeName: "vol-1", targetPath: "/data" },
    ]);
    expect(buildSpec("clickhouse", "24", "db-1", "vol-1", creds, resources).mounts).toEqual([
      { volumeName: "vol-1", targetPath: "/var/lib/clickhouse" },
    ]);
  });

  it("builds a mariadb spec with MARIADB_* env vars and a separate root password", () => {
    const spec = buildSpec("mariadb", "11.4", "db-1", "vol-1", { ...creds, rootPassword: "root-secret" }, resources);
    expect(spec.image).toBe("mariadb:11.4");
    expect(spec.env).toEqual({
      MARIADB_DATABASE: "openploy",
      MARIADB_USER: "openploy",
      MARIADB_PASSWORD: "secret-password",
      MARIADB_ROOT_PASSWORD: "root-secret",
    });
    expect(spec.mounts).toEqual([{ volumeName: "vol-1", targetPath: "/var/lib/mysql" }]);
  });

  it("falls back to the app password as the mariadb root password when none is set", () => {
    const spec = buildSpec("mariadb", "11.4", "db-1", "vol-1", creds, resources);
    expect(spec.env).toMatchObject({ MARIADB_ROOT_PASSWORD: "secret-password" });
  });

  it("builds a mongodb spec with MONGO_INITDB_ROOT_* env vars", () => {
    const spec = buildSpec("mongodb", "8.0", "db-1", "vol-1", creds, resources);
    expect(spec.image).toBe("mongo:8.0");
    expect(spec.env).toEqual({
      MONGO_INITDB_DATABASE: "openploy",
      MONGO_INITDB_ROOT_USERNAME: "openploy",
      MONGO_INITDB_ROOT_PASSWORD: "secret-password",
    });
    expect(spec.mounts).toEqual([{ volumeName: "vol-1", targetPath: "/data/db" }]);
  });
});
