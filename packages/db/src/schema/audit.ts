import { index, jsonb, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "../columns";
import { organizations } from "./orgs";
import { users } from "./auth";

/**
 * Append-only by design: application code only ever INSERTs here, through
 * the single logAuditEvent() helper in apps/web/src/server/audit.ts - never
 * call db.insert(auditLogs) anywhere else, and never add an .update()/.delete()
 * against this table.
 *
 * This is enforced in code only, not yet at the Postgres level. A REVOKE
 * UPDATE, DELETE ON audit_logs would be a no-op today: the installer's
 * POSTGRES_USER ("openploy") is created as a superuser by the official
 * postgres image, and superusers bypass all privilege checks. Making the
 * DB-level guarantee real requires a second, non-superuser role for runtime
 * app queries (migrations keep using the superuser role) - a real installer/
 * secrets change, deliberately deferred rather than shipped as a REVOKE that
 * only looks like protection.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(), // e.g. "service.deploy", "env.reveal"
    targetType: varchar("target_type", { length: 50 }).notNull(),
    targetId: uuid("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamps().createdAt,
  },
  (table) => [
    index("audit_logs_org_idx").on(table.organizationId),
    index("audit_logs_target_idx").on(table.targetType, table.targetId),
  ],
);
