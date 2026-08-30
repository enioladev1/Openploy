import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "../columns";
import { users } from "./auth";

// owner: the instance's original admin (from signup), exactly one per org,
// never assignable through the Users invite flow. admin: full read/write
// access. member: read-only everywhere except their own profile - enforced
// via writeProcedure (see trpc.ts), not per-procedure ad hoc checks.
export const orgRoleEnum = pgEnum("org_role", ["owner", "admin", "member"]);

export const organizations = pgTable("organizations", {
  id: id(),
  name: varchar("name", { length: 200 }).notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  ...timestamps(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRoleEnum("role").notNull().default("member"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("org_members_org_user_idx").on(table.organizationId, table.userId),
    index("org_members_user_idx").on(table.userId),
  ],
);

export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    role: orgRoleEnum("role").notNull().default("member"),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (table) => [index("invitations_org_idx").on(table.organizationId)],
);
