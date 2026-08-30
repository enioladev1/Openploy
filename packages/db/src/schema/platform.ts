import { boolean, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "../columns";
import { certificates } from "./config";

/**
 * At most one row, ever - the domain used to reach this installation's own
 * dashboard (the `web` app itself), as opposed to a domain attached to a
 * user-deployed service. Global, not org-scoped: this codebase's current
 * phase treats one installation as one org (see orgs.ts), and the dashboard
 * is one Next.js process shared by everyone on it, not a per-org resource.
 * Singleton-ness is enforced at the service layer (see platform-domain-service.ts),
 * same pattern as githubApps - no unique constraint here, "set" upserts the one row.
 */
export const platformDomains = pgTable("platform_domains", {
  id: id(),
  host: varchar("host", { length: 253 }).notNull(),
  certificateId: uuid("certificate_id").references(() => certificates.id, { onDelete: "set null" }),
  ...timestamps(),
});

export const platformUpdateStatusEnum = pgEnum("platform_update_status", ["idle", "running", "success", "failed"]);

/**
 * At most one row, ever - installation-wide settings that aren't tied to any
 * one domain. Separate from platformDomains (host is NOT NULL there, and a
 * custom dashboard domain is optional/set later) because acmeEmail needs to
 * exist as soon as the first admin signs up, before any domain is configured.
 */
export const platformSettings = pgTable("platform_settings", {
  id: id(),
  // Traefik's Let's Encrypt account contact - set from the signup email by
  // default (see auth-service.ts's signupInitialAdmin), editable later from
  // Settings > Dashboard domain. Null only in the brief window on a fresh
  // install before the first admin has signed up yet.
  acmeEmail: varchar("acme_email", { length: 320 }),
  // Self-update state (apps/agent's check/perform-platform-update workers).
  // "current" is only ever written right after a successful update (or by
  // the periodic check reading the live Swarm spec) - never assumed from a
  // local image cache, which this session proved can drift from what's
  // actually deployed after a manual `docker service update`. Versions, not
  // digests: a digest changes on every push to main, which is exactly the
  // axis that must NOT trigger "update available" - only a real GitHub
  // Release does. One latestVersion, not per-component, since a release
  // always versions web and agent together; two current* columns stay
  // separate since a partial update failure can genuinely leave them on
  // different versions (web updates first, agent last and self-killing).
  updateAvailable: boolean("update_available").notNull().default(false),
  updateStatus: platformUpdateStatusEnum("update_status").notNull().default("idle"),
  updateCheckedAt: timestamp("update_checked_at", { withTimezone: true }),
  updateStartedAt: timestamp("update_started_at", { withTimezone: true }),
  updateFinishedAt: timestamp("update_finished_at", { withTimezone: true }),
  updateError: text("update_error"),
  currentWebVersion: varchar("current_web_version", { length: 50 }),
  currentAgentVersion: varchar("current_agent_version", { length: 50 }),
  latestVersion: varchar("latest_version", { length: 50 }),
  ...timestamps(),
});
