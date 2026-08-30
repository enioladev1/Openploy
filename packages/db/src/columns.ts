import { doublePrecision, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

/** UUIDv7 primary key: time-sortable, better index locality than v4. */
export function id() {
  return uuid("id").primaryKey().$defaultFn(() => uuidv7());
}

export function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  };
}

/**
 * Every deployed container (Application, Database) carries these - never
 * optional, per the platform's "no unbounded workload" security default.
 * Defaults (1 vCPU / 512MB) apply until an admin raises them explicitly.
 */
export function resourceLimits() {
  return {
    cpuLimit: doublePrecision("cpu_limit").notNull().default(1),
    memoryLimitMb: integer("memory_limit_mb").notNull().default(512),
  };
}
