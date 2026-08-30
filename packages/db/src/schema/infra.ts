import { bigint, boolean, index, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "../columns";
import { organizations } from "./orgs";
import { services } from "./services";
import { users } from "./auth";

export const serverRoleEnum = pgEnum("server_role", ["manager", "worker"]);
export const serverStatusEnum = pgEnum("server_status", [
  "pending",
  "connecting",
  "active",
  "unreachable",
]);

export const servers = pgTable(
  "servers",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    host: varchar("host", { length: 253 }).notNull(),
    sshPort: bigint("ssh_port", { mode: "number" }).notNull().default(22),
    sshUsername: varchar("ssh_username", { length: 100 }).notNull(),
    // JSON-encoded EncryptedSecret; platform-generated keypair, never a user-supplied password stored long-term.
    sshPrivateKeyEncrypted: text("ssh_private_key_encrypted").notNull(),
    sshHostKeyFingerprint: varchar("ssh_host_key_fingerprint", { length: 200 }), // TOFU-pinned on first connect
    role: serverRoleEnum("role").notNull(),
    swarmNodeId: varchar("swarm_node_id", { length: 100 }),
    status: serverStatusEnum("status").notNull().default("pending"),
    isPlatformHost: boolean("is_platform_host").notNull().default(false),
    ...timestamps(),
  },
  (table) => [index("servers_org_idx").on(table.organizationId)],
);

export const deploymentStatusEnum = pgEnum("deployment_status", [
  "queued",
  "building",
  "deploying",
  "success",
  "failed",
  "canceled",
]);

export const deploymentTriggerEnum = pgEnum("deployment_trigger", ["manual", "webhook", "rollback"]);

export const deployments = pgTable(
  "deployments",
  {
    id: id(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    serverId: uuid("server_id").references(() => servers.id, { onDelete: "set null" }),
    status: deploymentStatusEnum("status").notNull().default("queued"),
    triggeredBy: deploymentTriggerEnum("triggered_by").notNull().default("manual"),
    triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id, { onDelete: "set null" }),
    // Idempotency key: webhook delivery id, or a client-generated key for manual triggers,
    // so retried requests can't double-deploy.
    idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
    // 64, not 40: GitHub also supports SHA-256 repositories (64 hex chars),
    // not just the traditional SHA-1 (40) - a webhook from one of those would
    // otherwise fail the insert with a truncation error on every push.
    commitSha: varchar("commit_sha", { length: 64 }),
    commitMessage: text("commit_message"),
    commitAuthor: varchar("commit_author", { length: 200 }),
    imageTag: varchar("image_tag", { length: 500 }),
    failureReason: text("failure_reason"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("deployments_service_started_idx").on(table.serviceId, table.startedAt),
    index("deployments_idempotency_idx").on(table.serviceId, table.idempotencyKey),
  ],
);

export const logStreamEnum = pgEnum("log_stream", ["build", "runtime"]);

export const deploymentLogs = pgTable(
  "deployment_logs",
  {
    id: id(),
    deploymentId: uuid("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    stream: logStreamEnum("stream").notNull(),
    // Monotonic per-deployment sequence so a reconnecting SSE client can resume
    // in order even if lines arrive out of order from the underlying pipe.
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    content: text("content").notNull(), // pre-redacted before insert, see packages/docker log pipeline
    createdAt: timestamps().createdAt,
  },
  (table) => [index("deployment_logs_deployment_seq_idx").on(table.deploymentId, table.sequence)],
);

/**
 * Generic envelope-encrypted blob store used by database credentials and
 * anything else that doesn't have an obvious single-purpose home. GitHub
 * tokens and SSH keys use their own encrypted columns on their owning tables
 * instead, since they're always 1:1 with a specific row.
 */
export const secrets = pgTable("secrets", {
  id: id(),
  ownerType: varchar("owner_type", { length: 50 }).notNull(),
  ownerId: uuid("owner_id").notNull(),
  cipherText: text("cipher_text").notNull(),
  iv: varchar("iv", { length: 64 }).notNull(),
  authTag: varchar("auth_tag", { length: 64 }).notNull(),
  wrappedDataKey: text("wrapped_data_key").notNull(),
  wrapIv: varchar("wrap_iv", { length: 64 }).notNull(),
  wrapAuthTag: varchar("wrap_auth_tag", { length: 64 }).notNull(),
  keyVersion: bigint("key_version", { mode: "number" }).notNull(),
  ...timestamps(),
});
