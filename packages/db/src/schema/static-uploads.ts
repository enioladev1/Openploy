import { customType, integer, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { services } from "./services";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * One row per application service, upserted on every upload - a deploy always
 * builds from whatever is currently stored here, not a history of past
 * uploads (deployments.imageTag is the durable record of what got shipped).
 */
export const staticUploads = pgTable("static_uploads", {
  serviceId: uuid("service_id")
    .primaryKey()
    .references(() => services.id, { onDelete: "cascade" }),
  filename: varchar("filename", { length: 300 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  zipData: bytea("zip_data").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});
