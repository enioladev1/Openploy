import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { id, resourceLimits, timestamps } from "../columns";
import { projects } from "./projects";
import { githubInstallations } from "./github";
import { users } from "./auth";

export const serviceTypeEnum = pgEnum("service_type", ["application", "database", "compose"]);

// apps/web never touches Docker directly (see packages/docker's boundary comment),
// so it can't ask the live Swarm API for status - the agent writes this after every
// provision/deploy action instead, and the UI reads it as a best-effort snapshot.
export const runtimeStatusEnum = pgEnum("runtime_status", ["unknown", "pending", "running", "failed", "stopped"]);

/**
 * Base row shared by every service; type-specific config lives in a 1:1 detail
 * table (application_services / database_services / compose_services) keyed
 * on this table's id, the discriminated-union pattern described in the plan.
 *
 * currentDeploymentId intentionally has NO foreign-key constraint: deployments
 * reference services.id, and this column points the other way, so a real FK
 * here would create a circular constraint. Consistency is maintained in the
 * deployment-finalize service function, not the schema.
 */
export const services = pgTable(
  "services",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    type: serviceTypeEnum("type").notNull(),
    runtimeStatus: runtimeStatusEnum("runtime_status").notNull().default("unknown"),
    // Set only alongside runtimeStatus writes (never on a plain metadata edit like
    // a rename) - the dashboard's "uptime" column reads this, not updatedAt, so
    // renaming a service doesn't reset how long it's shown as having been running.
    runtimeStatusChangedAt: timestamp("runtime_status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    currentDeploymentId: uuid("current_deployment_id"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (table) => [index("services_project_idx").on(table.projectId)],
);

export const buildMethodEnum = pgEnum("build_method", ["dockerfile", "heroku-buildpacks"]);

// Null until the Source tab's pill toggle is saved for the first time - services
// are created as an empty shell first, same as compose's sourceType.
export const applicationSourceTypeEnum = pgEnum("application_source_type", ["repo", "static"]);

export const applicationServices = pgTable("application_services", {
  serviceId: uuid("service_id")
    .primaryKey()
    .references(() => services.id, { onDelete: "cascade" }),
  sourceType: applicationSourceTypeEnum("source_type"),
  githubInstallationId: uuid("github_installation_id").references(() => githubInstallations.id, {
    onDelete: "set null",
  }),
  repoOwner: varchar("repo_owner", { length: 200 }),
  repoName: varchar("repo_name", { length: 200 }),
  branch: varchar("branch", { length: 250 }),
  buildMethod: buildMethodEnum("build_method").notNull().default("dockerfile"),
  // Only meaningful when buildMethod = 'dockerfile'; directory containing the Dockerfile
  // when it isn't at the repo root. Defaults to root.
  dockerfileDirectory: varchar("dockerfile_directory", { length: 500 }).notNull().default("/"),
  // Only meaningful when sourceType = 'repo' - static uploads have no push events to react to.
  autoDeployOnPush: boolean("auto_deploy_on_push").notNull().default(true),
  ...resourceLimits(),
});

export const dbEngineEnum = pgEnum("db_engine", ["postgres", "mysql", "redis", "clickhouse", "mongodb", "mariadb"]);

export const databaseServices = pgTable("database_services", {
  serviceId: uuid("service_id")
    .primaryKey()
    .references(() => services.id, { onDelete: "cascade" }),
  engine: dbEngineEnum("engine").notNull(),
  // Curated allowlist of image tags is enforced in packages/shared, never a free-text image field.
  version: varchar("version", { length: 50 }).notNull(),
  internalHost: varchar("internal_host", { length: 100 }).notNull(),
  internalPort: integer("internal_port").notNull(),
  databaseName: varchar("database_name", { length: 100 }).notNull().default("openploy"),
  // Null for redis, which has no user concept - just a single requirepass value.
  username: varchar("username", { length: 100 }),
  // References secrets.id (see infra.ts); no FK here to avoid the same cross-file
  // ordering issue as services.currentDeploymentId, kept consistent in the service layer.
  credentialsSecretId: uuid("credentials_secret_id").notNull(),
  // MySQL only: a genuinely separate root password from the app user's password.
  // Postgres has no equivalent (POSTGRES_USER is already superuser); redis has no users at all.
  rootCredentialsSecretId: uuid("root_credentials_secret_id"),
  volumeName: varchar("volume_name", { length: 200 }).notNull(),
  ...resourceLimits(),
});

export const composeSourceTypeEnum = pgEnum("compose_source_type", ["repo", "raw"]);

export const composeServices = pgTable("compose_services", {
  serviceId: uuid("service_id")
    .primaryKey()
    .references(() => services.id, { onDelete: "cascade" }),
  // Null until the setup step on the service detail page picks a source
  // (repo vs raw paste) - services are now created as an empty shell first.
  sourceType: composeSourceTypeEnum("source_type"),
  githubInstallationId: uuid("github_installation_id").references(() => githubInstallations.id, {
    onDelete: "set null",
  }),
  repoOwner: varchar("repo_owner", { length: 200 }),
  repoName: varchar("repo_name", { length: 200 }),
  branch: varchar("branch", { length: 250 }),
  composeFilePath: varchar("compose_file_path", { length: 500 }),
  // Raw user-pasted YAML, stored verbatim but never executed directly, always
  // re-parsed/validated/re-serialized at deploy time (see packages/compose).
  rawComposeContent: text("raw_compose_content"),
  exposedInnerService: varchar("exposed_inner_service", { length: 200 }),
});
