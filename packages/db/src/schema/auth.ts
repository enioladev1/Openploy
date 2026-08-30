import { boolean, index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "../columns";

// Authorization role lives on organization_members (see orgs.ts), not here;
// one source of truth for "what can this user do", never two columns that can drift apart.
export const users = pgTable("users", {
  id: id(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  totpSecretEncrypted: text("totp_secret_encrypted"), // JSON-encoded EncryptedSecret, null until enrolled
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  recoveryCodeHashes: text("recovery_code_hashes").array(), // hashed, one-time use
  ...timestamps(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    // True from creation until a successful TOTP check, for users with 2FA enabled.
    // A session in this state must not be treated as authenticated by any protected route.
    mfaPending: boolean("mfa_pending").notNull().default(false),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);
