import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  schedule: undefined as any,
  service: undefined as any,
  dbService: undefined as any,
  storageConfig: undefined as any,
  secretRow: undefined as any,
  updates: [] as any[],
  execCalls: [] as Array<{ serviceName: string; cmd: string[]; env?: string[] }>,
  execInContainerImpl: vi.fn(async () => "rdb_bgsave_in_progress:0"),
  uploads: [] as Array<{ key: string }>,
  deletedKeys: [] as string[][],
  listedObjects: [] as Array<{ key: string; lastModified: Date }>,
};

vi.mock("../db", () => ({
  db: {
    query: {
      databaseBackupSchedules: { findFirst: vi.fn(async () => state.schedule) },
      services: { findFirst: vi.fn(async () => state.service) },
      databaseServices: { findFirst: vi.fn(async () => state.dbService) },
      backupStorageConfigs: { findFirst: vi.fn(async () => state.storageConfig) },
      secrets: { findFirst: vi.fn(async () => state.secretRow) },
    },
    update: vi.fn(() => ({
      set: (values: any) => ({
        where: async () => {
          state.updates.push(values);
        },
      }),
    })),
  },
}));

vi.mock("@openploy/crypto", () => ({
  decryptSecret: vi.fn(() => "decrypted-secret"),
}));

vi.mock("@openploy/docker", () => ({
  execInContainer: vi.fn(async (serviceName: string, opts: { cmd: string[]; env?: string[] }) => {
    state.execCalls.push({ serviceName, ...opts });
    return state.execInContainerImpl();
  }),
  execInContainerStream: vi.fn(async (serviceName: string, opts: { cmd: string[]; env?: string[] }) => {
    state.execCalls.push({ serviceName, ...opts });
    const stdout = new PassThrough();
    stdout.end("fake dump content");
    return { stdout, waitForExit: vi.fn(async () => undefined) };
  }),
  getFileArchiveFromContainer: vi.fn(async () => new PassThrough()),
}));

vi.mock("../notifications", () => ({ notifyServiceEvent: vi.fn(async () => {}) }));

vi.mock("../tar-extract", () => ({
  extractFirstFileFromTar: vi.fn(async () => {
    const s = new PassThrough();
    s.end("fake-rdb");
    return s;
  }),
}));

vi.mock("@openploy/storage", () => ({
  uploadObjectStream: vi.fn(async (_config: unknown, key: string) => {
    state.uploads.push({ key });
  }),
  listObjectsWithPrefix: vi.fn(async () => state.listedObjects),
  deleteObjects: vi.fn(async (_config: unknown, keys: string[]) => {
    state.deletedKeys.push(keys);
  }),
}));

const { processRunDatabaseBackupJob } = await import("./run-database-backup");

const baseSchedule = {
  id: "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d",
  serviceId: "018e5a3e-0000-7000-8000-000000000001",
  backupStorageConfigId: "018e5a3e-0000-7000-8000-000000000002",
  retentionCount: null as number | null,
};

const baseService = { id: baseSchedule.serviceId, name: "My App DB" };

const baseStorageConfig = {
  id: baseSchedule.backupStorageConfigId,
  endpoint: "https://s3.example.com",
  region: "auto",
  bucket: "my-bucket",
  pathPrefix: "",
  forcePathStyle: true,
  accessKeyId: "key",
  secretAccessKeyEncrypted: JSON.stringify({ cipherText: "x" }),
};

const baseSecretRow = {
  keyVersion: 1,
  wrappedDataKey: "a",
  wrapIv: "b",
  wrapAuthTag: "c",
  cipherText: "d",
  iv: "e",
  authTag: "f",
};

describe("processRunDatabaseBackupJob", () => {
  beforeEach(() => {
    state.schedule = { ...baseSchedule };
    state.service = { ...baseService };
    state.storageConfig = { ...baseStorageConfig };
    state.secretRow = { ...baseSecretRow };
    state.updates = [];
    state.execCalls = [];
    state.execInContainerImpl = vi.fn(async () => "rdb_bgsave_in_progress:0");
    state.uploads = [];
    state.deletedKeys = [];
    state.listedObjects = [];
  });

  it("does nothing if the schedule was deleted before the job ran", async () => {
    state.schedule = undefined;
    await processRunDatabaseBackupJob({ scheduleId: baseSchedule.id });
    expect(state.updates).toEqual([]);
  });

  it("dumps a postgres database, uploads it under openploy-<service-name>/, and marks success", async () => {
    state.dbService = {
      serviceId: baseSchedule.serviceId,
      engine: "postgres",
      internalHost: `db-${baseSchedule.serviceId}`,
      databaseName: "app",
      username: "app_user",
      credentialsSecretId: "018e5a3e-0000-7000-8000-000000000003",
    };

    await processRunDatabaseBackupJob({ scheduleId: baseSchedule.id });

    expect(state.execCalls[0]).toMatchObject({
      serviceName: `db-${baseSchedule.serviceId}`,
      cmd: ["pg_dump", "-U", "app_user", "-d", "app"],
    });
    expect(state.uploads).toHaveLength(1);
    expect(state.uploads[0]!.key).toMatch(/^openploy-my-app-db\/.*\.sql\.gz$/);
    expect(state.updates.at(-1)).toMatchObject({ lastRunStatus: "success", lastRunError: null });
  });

  it("dumps mysql via MYSQL_PWD env, never as a CLI argument", async () => {
    state.dbService = {
      serviceId: baseSchedule.serviceId,
      engine: "mysql",
      internalHost: `db-${baseSchedule.serviceId}`,
      databaseName: "app",
      username: "app_user",
      credentialsSecretId: "018e5a3e-0000-7000-8000-000000000003",
    };

    await processRunDatabaseBackupJob({ scheduleId: baseSchedule.id });

    expect(state.execCalls[0]).toMatchObject({ cmd: ["mysqldump", "-uapp_user", "--single-transaction", "app"] });
    expect(state.execCalls[0]!.env).toEqual(["MYSQL_PWD=decrypted-secret"]);
    expect(state.updates.at(-1)).toMatchObject({ lastRunStatus: "success" });
  });

  it("dumps mariadb with mariadb-dump, not mysqldump, via MYSQL_PWD env", async () => {
    state.dbService = {
      serviceId: baseSchedule.serviceId,
      engine: "mariadb",
      internalHost: `db-${baseSchedule.serviceId}`,
      databaseName: "app",
      username: "app_user",
      credentialsSecretId: "018e5a3e-0000-7000-8000-000000000003",
    };

    await processRunDatabaseBackupJob({ scheduleId: baseSchedule.id });

    expect(state.execCalls[0]).toMatchObject({ cmd: ["mariadb-dump", "-uapp_user", "--single-transaction", "app"] });
    expect(state.execCalls[0]!.env).toEqual(["MYSQL_PWD=decrypted-secret"]);
    expect(state.uploads[0]!.key).toMatch(/\.sql\.gz$/);
    expect(state.updates.at(-1)).toMatchObject({ lastRunStatus: "success" });
  });

  it("dumps mongodb via mongodump --archive --gzip, uploading the raw (already-gzipped) stream", async () => {
    state.dbService = {
      serviceId: baseSchedule.serviceId,
      engine: "mongodb",
      internalHost: `db-${baseSchedule.serviceId}`,
      databaseName: "app",
      username: "app_user",
      credentialsSecretId: "018e5a3e-0000-7000-8000-000000000003",
    };

    await processRunDatabaseBackupJob({ scheduleId: baseSchedule.id });

    expect(state.execCalls[0]).toMatchObject({
      cmd: ["mongodump", "--username=app_user", "--password=decrypted-secret", "--authenticationDatabase=admin", "--db=app", "--archive", "--gzip"],
    });
    expect(state.uploads[0]!.key).toMatch(/\.archive\.gz$/);
    expect(state.updates.at(-1)).toMatchObject({ lastRunStatus: "success" });
  });

  it("triggers BGSAVE and uploads the extracted dump.rdb for redis", async () => {
    state.dbService = {
      serviceId: baseSchedule.serviceId,
      engine: "redis",
      internalHost: `db-${baseSchedule.serviceId}`,
      databaseName: "openploy",
      username: null,
      credentialsSecretId: "018e5a3e-0000-7000-8000-000000000003",
    };

    await processRunDatabaseBackupJob({ scheduleId: baseSchedule.id });

    expect(state.execCalls.some((c) => c.cmd[1] === "BGSAVE")).toBe(true);
    expect(state.uploads[0]!.key).toMatch(/\.rdb$/);
    expect(state.updates.at(-1)).toMatchObject({ lastRunStatus: "success" });
  });

  it("marks the schedule failed with a clear message for an unsupported engine", async () => {
    state.dbService = {
      serviceId: baseSchedule.serviceId,
      engine: "clickhouse",
      internalHost: `db-${baseSchedule.serviceId}`,
      databaseName: "app",
      username: "app_user",
      credentialsSecretId: "018e5a3e-0000-7000-8000-000000000003",
    };

    await processRunDatabaseBackupJob({ scheduleId: baseSchedule.id });

    expect(state.updates.at(-1)).toMatchObject({ lastRunStatus: "failed" });
    expect(state.updates.at(-1)!.lastRunError).toMatch(/aren't supported/);
  });

  it("applies retention by deleting the oldest objects beyond retentionCount, keeping the newest", async () => {
    state.schedule.retentionCount = 2;
    state.dbService = {
      serviceId: baseSchedule.serviceId,
      engine: "postgres",
      internalHost: `db-${baseSchedule.serviceId}`,
      databaseName: "app",
      username: "app_user",
      credentialsSecretId: "018e5a3e-0000-7000-8000-000000000003",
    };
    state.listedObjects = [
      { key: "openploy-my-app-db/oldest.sql.gz", lastModified: new Date("2026-01-01") },
      { key: "openploy-my-app-db/middle.sql.gz", lastModified: new Date("2026-01-02") },
      { key: "openploy-my-app-db/newest.sql.gz", lastModified: new Date("2026-01-03") },
    ];

    await processRunDatabaseBackupJob({ scheduleId: baseSchedule.id });

    expect(state.deletedKeys).toHaveLength(1);
    expect(state.deletedKeys[0]).toEqual(["openploy-my-app-db/oldest.sql.gz"]);
  });

  it("does not prune anything when retentionCount is not set", async () => {
    state.dbService = {
      serviceId: baseSchedule.serviceId,
      engine: "postgres",
      internalHost: `db-${baseSchedule.serviceId}`,
      databaseName: "app",
      username: "app_user",
      credentialsSecretId: "018e5a3e-0000-7000-8000-000000000003",
    };

    await processRunDatabaseBackupJob({ scheduleId: baseSchedule.id });

    expect(state.deletedKeys).toEqual([]);
  });
});
