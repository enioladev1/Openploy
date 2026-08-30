import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "../columns";
import { organizations } from "./orgs";
import { users } from "./auth";

/** Usually a single row: the platform's own GitHub App registration, created via the setup wizard. */
export const githubApps = pgTable("github_apps", {
  id: id(),
  appId: varchar("app_id", { length: 50 }).notNull(),
  appSlug: varchar("app_slug", { length: 200 }).notNull(),
  privateKeyEncrypted: text("private_key_encrypted").notNull(), // JSON-encoded EncryptedSecret
  webhookSecretEncrypted: text("webhook_secret_encrypted").notNull(),
  clientId: varchar("client_id", { length: 100 }).notNull(),
  clientSecretEncrypted: text("client_secret_encrypted").notNull(),
  ...timestamps(),
});

export const githubAccountTypeEnum = ["User", "Organization"] as const;

export const githubInstallations = pgTable(
  "github_installations",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    installationId: varchar("installation_id", { length: 50 }).notNull().unique(),
    accountLogin: varchar("account_login", { length: 200 }).notNull(),
    accountType: varchar("account_type", { length: 20 }).notNull(),
    // Short-lived (~1h) installation access token, cached and refreshed lazily; never a long-lived PAT.
    installationTokenEncrypted: text("installation_token_encrypted"),
    installationTokenExpiresAt: timestamp("installation_token_expires_at", { withTimezone: true }),
    connectedByUserId: uuid("connected_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (table) => [index("github_installations_org_idx").on(table.organizationId)],
);

export const githubRepoCache = pgTable(
  "github_repo_cache",
  {
    id: id(),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => githubInstallations.id, { onDelete: "cascade" }),
    repoFullName: varchar("repo_full_name", { length: 400 }).notNull(),
    defaultBranch: varchar("default_branch", { length: 200 }).notNull(),
    isPrivate: boolean("is_private").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("github_repo_cache_installation_repo_idx").on(table.installationId, table.repoFullName),
  ],
);
