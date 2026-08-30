import { z } from "zod";

export const buildMethodSchema = z.enum(["dockerfile", "heroku-buildpacks"]);

export const portSchema = z.number().int().min(1).max(65535);

// RFC 1123-ish hostname check; punycode/IDN domains are out of scope for v1.
const hostnamePattern = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))+$/;
export const hostnameSchema = z.string().max(253).regex(hostnamePattern, "Must be a valid domain name");

// Application and compose services are created as an empty named shell first,
// then configured (repo, build settings, source) from the service detail page.
export const createServiceShellInputSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(200),
});
export type CreateServiceShellInput = z.infer<typeof createServiceShellInputSchema>;

export const renameServiceInputSchema = z.object({
  serviceId: z.string().uuid(),
  name: z.string().min(1).max(200),
});
export type RenameServiceInput = z.infer<typeof renameServiceInputSchema>;

export const applicationConfigInputSchema = z.object({
  serviceId: z.string().uuid(),
  githubInstallationId: z.string().uuid(),
  repoOwner: z.string().min(1).max(200),
  repoName: z.string().min(1).max(200),
  branch: z.string().min(1).max(250),
  buildMethod: buildMethodSchema,
  // Only meaningful when buildMethod is "dockerfile"; ignored otherwise. Always
  // normalized to start with "/" so the agent never receives an ambiguous relative path.
  dockerfileDirectory: z
    .string()
    .max(500)
    .default("/")
    .transform((value) => (value.startsWith("/") ? value : `/${value}`)),
  autoDeployOnPush: z.boolean().default(true),
});
export type ApplicationConfigInput = z.infer<typeof applicationConfigInputSchema>;

export const envVarKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Must be a valid environment variable name");

export const envVarScopeSchema = z.enum(["build", "runtime"]);

export const envVarReferenceFieldSchema = z.enum([
  "connection_string",
  "host",
  "port",
  "username",
  "password",
  "database_name",
]);
export type EnvVarReferenceField = z.infer<typeof envVarReferenceFieldSchema>;

// "value": a plain stored value, encrypted at rest, edited via the bulk text
// editor. "reference": points at another (database) service's connection info
// instead of storing a value - resolved live at deploy time, and always
// treated as secret regardless of isSecret since it may resolve to a password.
export const setEnvVarInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("value"),
    serviceId: z.string().uuid(),
    key: envVarKeySchema,
    value: z.string().max(65536),
    isSecret: z.boolean().default(true),
    scope: envVarScopeSchema.default("runtime"),
  }),
  z.object({
    kind: z.literal("reference"),
    serviceId: z.string().uuid(),
    key: envVarKeySchema,
    referencesServiceId: z.string().uuid(),
    referencesField: envVarReferenceFieldSchema,
    scope: envVarScopeSchema.default("runtime"),
  }),
]);
export type SetEnvVarInput = z.infer<typeof setEnvVarInputSchema>;

/**
 * The whole-textarea "paste your .env" editor: entries here are the complete,
 * authoritative set for (serviceId, scope) - the server diffs against what's
 * currently stored and deletes anything missing from this list, matching the
 * mental model of "this box is my env file" rather than an additive form.
 */
export const bulkSetEnvVarsInputSchema = z.object({
  serviceId: z.string().uuid(),
  scope: envVarScopeSchema,
  entries: z.array(z.object({ key: envVarKeySchema, value: z.string().max(65536) })).max(500),
});
export type BulkSetEnvVarsInput = z.infer<typeof bulkSetEnvVarsInputSchema>;

export const createDomainInputSchema = z.object({
  serviceId: z.string().uuid(),
  host: hostnameSchema,
  path: z.string().max(500).default("/"),
  targetPort: portSchema,
  // Auto-provisions a letsencrypt-http01 certificate row when true; custom
  // cert upload is a Phase 4 extension, not v1 scope.
  enableTls: z.boolean().default(true),
  isPrimary: z.boolean().default(false),
});
export type CreateDomainInput = z.infer<typeof createDomainInputSchema>;

export const generateNipIoDomainInputSchema = z.object({
  serviceId: z.string().uuid(),
  targetPort: portSchema,
  enableTls: z.boolean().default(true),
});
export type GenerateNipIoDomainInput = z.infer<typeof generateNipIoDomainInputSchema>;

export const triggerDeploymentInputSchema = z.object({
  serviceId: z.string().uuid(),
  // Client-generated idempotency key for manual triggers so a double-click or
  // retried request can't enqueue two deployments; webhooks use the GitHub delivery id instead.
  idempotencyKey: z.string().uuid(),
});
export type TriggerDeploymentInput = z.infer<typeof triggerDeploymentInputSchema>;

// Curated allowlist, never a free-text image field - see the plan's Database
// Service Provisioning section.
export const DATABASE_ENGINE_VERSIONS = {
  postgres: ["18", "16", "15", "14"],
  mysql: ["8.4", "8.0"],
  redis: ["8", "7.4", "7.2"],
  clickhouse: ["26.4", "26.3", "25.8"],
  mongodb: ["8.0", "7.0", "6.0"],
  mariadb: ["11.4", "10.11"],
} as const;

export const dbEngineSchema = z.enum(["postgres", "mysql", "redis", "clickhouse", "mongodb", "mariadb"]);

// Postgres/MySQL/ClickHouse identifier rules (loosely): start with a letter or
// underscore, then letters/digits/underscores - avoids needing to quote-escape
// any of these engines' SQL identifiers downstream, and keeps a 63-char
// ceiling (Postgres's own limit). Exported so the create-database form can
// validate inline instead of only finding out after a round trip to the server.
export const databaseIdentifierSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Must start with a letter or underscore, and contain only letters, digits, or underscores");

// User-settable rather than always-generated now, so a floor on length/strength
// still matters here even though the UI offers a "Generate" button that produces
// something far stronger - this is the backstop for whatever a user types by hand.
export const databasePasswordSchema = z.string().min(8).max(128);

const databaseServiceBase = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(200),
  version: z.string().min(1).max(50),
});

export const createDatabaseServiceInputSchema = z
  .discriminatedUnion("engine", [
    databaseServiceBase.extend({
      engine: z.literal("postgres"),
      databaseName: databaseIdentifierSchema,
      username: databaseIdentifierSchema,
      password: databasePasswordSchema,
    }),
    databaseServiceBase.extend({
      engine: z.literal("mysql"),
      databaseName: databaseIdentifierSchema,
      username: databaseIdentifierSchema,
      password: databasePasswordSchema,
      rootPassword: databasePasswordSchema,
    }),
    databaseServiceBase.extend({
      // Redis has no database-name or username concept - just a single password.
      engine: z.literal("redis"),
      password: databasePasswordSchema,
    }),
    databaseServiceBase.extend({
      // Like Postgres: a real app user/database, no separate root credential.
      engine: z.literal("clickhouse"),
      databaseName: databaseIdentifierSchema,
      username: databaseIdentifierSchema,
      password: databasePasswordSchema,
    }),
    databaseServiceBase.extend({
      // MongoDB's app user is created directly in the target database (no
      // separate superuser concept exposed here) - same shape as Postgres/ClickHouse.
      engine: z.literal("mongodb"),
      databaseName: databaseIdentifierSchema,
      username: databaseIdentifierSchema,
      password: databasePasswordSchema,
    }),
    databaseServiceBase.extend({
      // Wire-compatible with MySQL, including the separate root credential.
      engine: z.literal("mariadb"),
      databaseName: databaseIdentifierSchema,
      username: databaseIdentifierSchema,
      password: databasePasswordSchema,
      rootPassword: databasePasswordSchema,
    }),
  ])
  .refine(
    (input) => (DATABASE_ENGINE_VERSIONS[input.engine] as readonly string[]).includes(input.version),
    { message: "Unsupported version for this engine", path: ["version"] },
  );
export type CreateDatabaseServiceInput = z.infer<typeof createDatabaseServiceInputSchema>;

export const composeSourceTypeSchema = z.enum(["repo", "raw"]);

const composeSourceBase = z.object({
  serviceId: z.string().uuid(),
});

export const composeSourceInputSchema = z.discriminatedUnion("sourceType", [
  composeSourceBase.extend({
    sourceType: z.literal("repo"),
    githubInstallationId: z.string().uuid(),
    repoOwner: z.string().min(1).max(200),
    repoName: z.string().min(1).max(200),
    branch: z.string().min(1).max(250),
    composeFilePath: z.string().min(1).max(500).default("docker-compose.yml"),
  }),
  composeSourceBase.extend({
    sourceType: z.literal("raw"),
    rawComposeContent: z.string().min(1).max(100_000),
  }),
]);
export type ComposeSourceInput = z.infer<typeof composeSourceInputSchema>;

export const createServerInputSchema = z.object({
  name: z.string().min(1).max(200),
  host: z.string().min(1).max(253),
  sshPort: portSchema.default(22),
  sshUsername: z.string().min(1).max(100),
  allowPrivateNetworkTarget: z.boolean().default(false),
});
export type CreateServerInput = z.infer<typeof createServerInputSchema>;
