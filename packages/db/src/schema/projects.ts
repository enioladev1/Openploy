import { index, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "../columns";
import { organizations } from "./orgs";
import { users } from "./auth";

export const projects = pgTable(
  "projects",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (table) => [index("projects_org_idx").on(table.organizationId)],
);
