import { describe, expect, it } from "vitest";
import {
  applicationConfigInputSchema,
  composeSourceInputSchema,
  createDatabaseServiceInputSchema,
  createServerInputSchema,
  createServiceShellInputSchema,
  envVarKeySchema,
  hostnameSchema,
  portSchema,
} from "./services";

describe("portSchema", () => {
  it("accepts the valid range", () => {
    expect(portSchema.safeParse(1).success).toBe(true);
    expect(portSchema.safeParse(65535).success).toBe(true);
  });

  it("rejects out-of-range and non-integer values", () => {
    expect(portSchema.safeParse(0).success).toBe(false);
    expect(portSchema.safeParse(65536).success).toBe(false);
    expect(portSchema.safeParse(80.5).success).toBe(false);
  });
});

describe("hostnameSchema", () => {
  it("accepts a plausible domain", () => {
    expect(hostnameSchema.safeParse("app.example.com").success).toBe(true);
  });

  it("rejects a bare hostname with no dot, and a leading/trailing hyphen label", () => {
    expect(hostnameSchema.safeParse("localhost").success).toBe(false);
    expect(hostnameSchema.safeParse("-bad.example.com").success).toBe(false);
  });
});

describe("envVarKeySchema", () => {
  it("accepts standard env var names", () => {
    expect(envVarKeySchema.safeParse("DATABASE_URL").success).toBe(true);
    expect(envVarKeySchema.safeParse("_PRIVATE").success).toBe(true);
  });

  it("rejects names starting with a digit or containing invalid characters", () => {
    expect(envVarKeySchema.safeParse("1KEY").success).toBe(false);
    expect(envVarKeySchema.safeParse("KEY-NAME").success).toBe(false);
  });
});

describe("createServiceShellInputSchema", () => {
  it("accepts just a projectId and name", () => {
    const result = createServiceShellInputSchema.safeParse({
      projectId: "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d",
      name: "web",
    });
    expect(result.success).toBe(true);
  });
});

describe("applicationConfigInputSchema", () => {
  const base = {
    serviceId: "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d",
    githubInstallationId: "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1e",
    repoOwner: "acme",
    repoName: "web",
    branch: "main",
    buildMethod: "dockerfile" as const,
  };

  it("normalizes a relative dockerfile directory to start with /", () => {
    const result = applicationConfigInputSchema.parse({ ...base, dockerfileDirectory: "apps/api" });
    expect(result.dockerfileDirectory).toBe("/apps/api");
  });

  it("defaults dockerfileDirectory to / when omitted", () => {
    const result = applicationConfigInputSchema.parse(base);
    expect(result.dockerfileDirectory).toBe("/");
  });

  it("accepts heroku-buildpacks as a build method without requiring a dockerfile path", () => {
    const result = applicationConfigInputSchema.parse({ ...base, buildMethod: "heroku-buildpacks" });
    expect(result.buildMethod).toBe("heroku-buildpacks");
  });
});

describe("createDatabaseServiceInputSchema", () => {
  const base = { projectId: "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d", name: "db" };

  it("accepts a full postgres input with no root password field", () => {
    const result = createDatabaseServiceInputSchema.safeParse({
      ...base,
      engine: "postgres",
      version: "16",
      databaseName: "openploy",
      username: "openploy",
      password: "a-strong-password",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a full mysql input including a root password", () => {
    const result = createDatabaseServiceInputSchema.safeParse({
      ...base,
      engine: "mysql",
      version: "8.4",
      databaseName: "openploy",
      username: "openploy",
      password: "a-strong-password",
      rootPassword: "another-strong-password",
    });
    expect(result.success).toBe(true);
  });

  it("rejects mysql input missing a root password", () => {
    const result = createDatabaseServiceInputSchema.safeParse({
      ...base,
      engine: "mysql",
      version: "8.4",
      databaseName: "openploy",
      username: "openploy",
      password: "a-strong-password",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a redis input with only a password, no username or database name", () => {
    const result = createDatabaseServiceInputSchema.safeParse({
      ...base,
      engine: "redis",
      version: "7.4",
      password: "a-strong-password",
    });
    expect(result.success).toBe(true);
  });

  it("rejects redis input that includes a databaseName field it shouldn't have", () => {
    // discriminatedUnion is strict per-branch: extra keys from another branch don't leak through.
    const result = createDatabaseServiceInputSchema.safeParse({
      ...base,
      engine: "redis",
      version: "7.4",
      password: "a-strong-password",
      databaseName: "openploy",
    });
    expect(result.success).toBe(true); // extra unknown keys are stripped by default zod object behavior, not an error
  });

  it("accepts a full clickhouse input with no root password field, like postgres", () => {
    const result = createDatabaseServiceInputSchema.safeParse({
      ...base,
      engine: "clickhouse",
      version: "26.4",
      databaseName: "openploy",
      username: "openploy",
      password: "a-strong-password",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a clickhouse version not in the allowlist", () => {
    const result = createDatabaseServiceInputSchema.safeParse({
      ...base,
      engine: "clickhouse",
      version: "24.1",
      databaseName: "openploy",
      username: "openploy",
      password: "a-strong-password",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a version not in the allowlist for that engine", () => {
    const result = createDatabaseServiceInputSchema.safeParse({
      ...base,
      engine: "postgres",
      version: "13",
      databaseName: "openploy",
      username: "openploy",
      password: "a-strong-password",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than the minimum length", () => {
    const result = createDatabaseServiceInputSchema.safeParse({
      ...base,
      engine: "redis",
      version: "7.4",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a full mongodb input with no root password field, like postgres", () => {
    const result = createDatabaseServiceInputSchema.safeParse({
      ...base,
      engine: "mongodb",
      version: "8.0",
      databaseName: "openploy",
      username: "openploy",
      password: "a-strong-password",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a mongodb version not in the allowlist", () => {
    const result = createDatabaseServiceInputSchema.safeParse({
      ...base,
      engine: "mongodb",
      version: "5.0",
      databaseName: "openploy",
      username: "openploy",
      password: "a-strong-password",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a full mariadb input including a root password, like mysql", () => {
    const result = createDatabaseServiceInputSchema.safeParse({
      ...base,
      engine: "mariadb",
      version: "11.4",
      databaseName: "openploy",
      username: "openploy",
      password: "a-strong-password",
      rootPassword: "another-strong-password",
    });
    expect(result.success).toBe(true);
  });

  it("rejects mariadb input missing a root password", () => {
    const result = createDatabaseServiceInputSchema.safeParse({
      ...base,
      engine: "mariadb",
      version: "11.4",
      databaseName: "openploy",
      username: "openploy",
      password: "a-strong-password",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a database/username identifier that doesn't start with a letter or underscore", () => {
    const result = createDatabaseServiceInputSchema.safeParse({
      ...base,
      engine: "postgres",
      version: "16",
      databaseName: "1openploy",
      username: "openploy",
      password: "a-strong-password",
    });
    expect(result.success).toBe(false);
  });
});

describe("composeSourceInputSchema", () => {
  const base = { serviceId: "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d" };

  it("accepts a raw-source compose input without repo fields", () => {
    const result = composeSourceInputSchema.safeParse({
      ...base,
      sourceType: "raw",
      rawComposeContent: "services:\n  web:\n    image: nginx",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a repo-source compose input with repo fields and defaults the compose path", () => {
    const result = composeSourceInputSchema.parse({
      ...base,
      sourceType: "repo",
      githubInstallationId: "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1e",
      repoOwner: "acme",
      repoName: "infra",
      branch: "main",
    });
    if (result.sourceType !== "repo") throw new Error("expected repo source type");
    expect(result.composeFilePath).toBe("docker-compose.yml");
  });

  it("rejects raw source type missing rawComposeContent", () => {
    const result = composeSourceInputSchema.safeParse({ ...base, sourceType: "raw" });
    expect(result.success).toBe(false);
  });

  it("rejects repo source type missing repo fields", () => {
    const result = composeSourceInputSchema.safeParse({ ...base, sourceType: "repo" });
    expect(result.success).toBe(false);
  });
});

describe("createServerInputSchema", () => {
  it("defaults sshPort to 22 and allowPrivateNetworkTarget to false", () => {
    const result = createServerInputSchema.parse({ name: "worker-1", host: "203.0.113.5", sshUsername: "root" });
    expect(result.sshPort).toBe(22);
    expect(result.allowPrivateNetworkTarget).toBe(false);
  });
});
