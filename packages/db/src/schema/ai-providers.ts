import { boolean, index, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "../columns";
import { organizations } from "./orgs";

export const aiProviderKindEnum = pgEnum("ai_provider_kind", ["openai", "anthropic", "openrouter"]);

export const aiProviderTestStatusEnum = pgEnum("ai_provider_test_status", ["success", "failed"]);

/** One row per connected AI provider - only apiKey is secret, apiUrl/model stay plain so they can be listed/edited without decrypting anything. */
export const aiProviders = pgTable(
  "ai_providers",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    provider: aiProviderKindEnum("provider").notNull(),
    apiUrl: varchar("api_url", { length: 500 }).notNull(),
    model: varchar("model", { length: 200 }).notNull(),
    apiKeyEncrypted: text("api_key_encrypted").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),

    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestStatus: aiProviderTestStatusEnum("last_test_status"),
    lastTestError: text("last_test_error"),

    ...timestamps(),
  },
  (table) => [index("ai_providers_org_idx").on(table.organizationId)],
);
