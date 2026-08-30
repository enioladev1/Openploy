import { describe, expect, it } from "vitest";
import { buildRedactor } from "./redact";

describe("buildRedactor", () => {
  it("replaces every occurrence of a known secret value", () => {
    const redact = buildRedactor(["super-secret-password"]);
    const result = redact("connecting with password=super-secret-password to db");
    expect(result).not.toContain("super-secret-password");
    expect(result).toBe("connecting with password=*** to db");
  });

  it("redacts a secret that appears multiple times in the same line", () => {
    const redact = buildRedactor(["abc123def"]);
    expect(redact("abc123def and again abc123def")).toBe("*** and again ***");
  });

  it("ignores short values (below the 8-char floor) so it doesn't over-redact ordinary words", () => {
    const redact = buildRedactor(["local", "file", "mysql"]);
    // These are exactly the kind of ordinary Laravel .env values (FILESYSTEM_DISK=local,
    // CACHE_STORE=file, DB_CONNECTION=mysql) that previously mangled unrelated build
    // output like "Dockerfile" -> "Docker***" and "pdo_mysql" -> "pdo_***".
    expect(redact("Building from Dockerfile using pdo_mysql and /usr/local/bin")).toBe(
      "Building from Dockerfile using pdo_mysql and /usr/local/bin",
    );
  });

  it("redacts a PEM private key block via the generic pattern even if not in the known-secrets list", () => {
    const redact = buildRedactor([]);
    const line = "-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJ...\n-----END RSA PRIVATE KEY-----";
    expect(redact(line)).toBe("***");
  });

  it("redacts a GitHub token shape via the generic pattern", () => {
    const redact = buildRedactor([]);
    expect(redact("token: ghp_1234567890abcdef1234567890abcdef1234")).toBe("token: ***");
  });

  it("leaves an unrelated log line untouched", () => {
    const redact = buildRedactor(["some-secret-value"]);
    expect(redact("Server started on port 3000")).toBe("Server started on port 3000");
  });
});
