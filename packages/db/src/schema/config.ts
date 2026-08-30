import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "../columns";
import { services } from "./services";

export const envVarScopeEnum = pgEnum("env_var_scope", ["build", "runtime"]);

export const envVarReferenceFieldEnum = pgEnum("env_var_reference_field", [
  "connection_string",
  "host",
  "port",
  "username",
  "password",
  "database_name",
]);

export const environmentVariables = pgTable(
  "environment_variables",
  {
    id: id(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 200 }).notNull(),
    // JSON-encoded EncryptedSecret (see packages/crypto); every env var is encrypted at
    // rest regardless of isSecret, isSecret only controls UI masking/log-redaction behavior.
    // Null when referencesServiceId is set - the value is resolved live from
    // the referenced service at deploy time instead of stored here.
    valueEncrypted: text("value_encrypted"),
    isSecret: boolean("is_secret").notNull().default(true),
    scope: envVarScopeEnum("scope").notNull().default("runtime"),
    // Links this variable to another (database) service's connection info instead
    // of a stored value - set null (not cascaded) if the referenced service is
    // deleted, so the pointing variable surfaces as broken rather than vanishing.
    referencesServiceId: uuid("references_service_id").references(() => services.id, { onDelete: "set null" }),
    referencesField: envVarReferenceFieldEnum("references_field"),
    ...timestamps(),
  },
  (table) => [
    index("environment_variables_service_idx").on(table.serviceId),
    index("environment_variables_references_service_idx").on(table.referencesServiceId),
  ],
);

export const certificateProviderEnum = pgEnum("certificate_provider", [
  "letsencrypt-http01",
  "letsencrypt-dns01",
  "custom-uploaded",
]);

export const certificateStatusEnum = pgEnum("certificate_status", [
  "pending",
  "issued",
  "failed",
  "expired",
]);

export const certificates = pgTable("certificates", {
  id: id(),
  domain: varchar("domain", { length: 253 }).notNull(),
  provider: certificateProviderEnum("provider").notNull().default("letsencrypt-http01"),
  status: certificateStatusEnum("status").notNull().default("pending"),
  // Only populated for custom-uploaded; for ACME, Traefik's acme.json is the source of
  // truth and these are just JSON-encoded EncryptedSecret mirrors for UI display.
  certPemEncrypted: text("cert_pem_encrypted"),
  keyPemEncrypted: text("key_pem_encrypted"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...timestamps(),
});

export const domains = pgTable(
  "domains",
  {
    id: id(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    host: varchar("host", { length: 253 }).notNull(),
    path: varchar("path", { length: 500 }).notNull().default("/"),
    targetPort: integer("target_port"),
    certificateId: uuid("certificate_id").references(() => certificates.id, { onDelete: "set null" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps(),
  },
  (table) => [index("domains_service_idx").on(table.serviceId)],
);
