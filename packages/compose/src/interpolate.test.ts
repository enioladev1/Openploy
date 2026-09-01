import { describe, expect, it } from "vitest";
import { interpolateComposeVariables } from "./interpolate";

describe("interpolateComposeVariables", () => {
  it("substitutes a simple ${VAR} reference", () => {
    const result = interpolateComposeVariables("host: ${N8N_HOST}", { N8N_HOST: "n8n.example.com" });
    expect(result.yaml).toBe("host: n8n.example.com");
    expect(result.missingVariables).toEqual([]);
  });

  it("substitutes multiple references anywhere in the file, not just inside one service", () => {
    const raw = `
services:
  app:
    image: n8nio/n8n:\${N8N_VERSION}
    environment:
      - N8N_HOST=\${N8N_HOST}
      - N8N_PORT=\${N8N_PORT}
`;
    const result = interpolateComposeVariables(raw, { N8N_VERSION: "1.60.0", N8N_HOST: "n8n.local", N8N_PORT: "5678" });
    expect(result.yaml).toContain("image: n8nio/n8n:1.60.0");
    expect(result.yaml).toContain("N8N_HOST=n8n.local");
    expect(result.yaml).toContain("N8N_PORT=5678");
    expect(result.missingVariables).toEqual([]);
  });

  it("uses the default value when the variable is not provided", () => {
    const result = interpolateComposeVariables("port: ${PORT:-8080}", {});
    expect(result.yaml).toBe("port: 8080");
    expect(result.missingVariables).toEqual([]);
  });

  it("prefers the provided value over the default", () => {
    const result = interpolateComposeVariables("port: ${PORT:-8080}", { PORT: "9090" });
    expect(result.yaml).toBe("port: 9090");
  });

  it("reports a missing variable with no default and leaves the placeholder untouched", () => {
    const result = interpolateComposeVariables("host: ${N8N_HOST}", {});
    expect(result.yaml).toBe("host: ${N8N_HOST}");
    expect(result.missingVariables).toEqual(["N8N_HOST"]);
  });

  it("deduplicates a variable referenced multiple times when reporting missing variables", () => {
    const result = interpolateComposeVariables("${FOO} and ${FOO} again", {});
    expect(result.missingVariables).toEqual(["FOO"]);
  });

  it("does not touch bare $VAR without braces", () => {
    const result = interpolateComposeVariables("echo $HOME", { HOME: "/root" });
    expect(result.yaml).toBe("echo $HOME");
    expect(result.missingVariables).toEqual([]);
  });

  it("uses the default value with the unset-only form ${VAR-default}", () => {
    const result = interpolateComposeVariables("port: ${PORT-8080}", {});
    expect(result.yaml).toBe("port: 8080");
    expect(result.missingVariables).toEqual([]);
  });

  it("reports a missing variable using the required form ${VAR:?message}, leaving the placeholder untouched", () => {
    const result = interpolateComposeVariables('host: "${DB_PASSWORD:?set a strong password}"', {});
    expect(result.yaml).toBe('host: "${DB_PASSWORD:?set a strong password}"');
    expect(result.missingVariables).toEqual(["DB_PASSWORD"]);
  });

  it("reports a missing variable using the required form ${VAR?message}", () => {
    const result = interpolateComposeVariables("host: ${DB_PASSWORD?set a strong password}", {});
    expect(result.missingVariables).toEqual(["DB_PASSWORD"]);
  });

  it("substitutes the provided value for a required ${VAR:?message} reference", () => {
    const result = interpolateComposeVariables("host: ${DB_PASSWORD:?set a strong password}", { DB_PASSWORD: "hunter2" });
    expect(result.yaml).toBe("host: hunter2");
    expect(result.missingVariables).toEqual([]);
  });

  it("leaves plain text with no variable references unchanged", () => {
    const raw = "services:\n  web:\n    image: nginx:latest\n";
    const result = interpolateComposeVariables(raw, {});
    expect(result.yaml).toBe(raw);
    expect(result.missingVariables).toEqual([]);
  });

  it("resolves a nested ${VAR:-${OTHER}} default without truncating on the inner variable's closing brace", () => {
    const result = interpolateComposeVariables("secret: ${JWT_JWKS:-${JWT_SECRET}}", { JWT_SECRET: "shh" });
    expect(result.yaml).toBe("secret: shh");
    expect(result.missingVariables).toEqual([]);
  });

  it("resolves a literal JSON default containing braces without truncating early", () => {
    const result = interpolateComposeVariables('jwks: ${JWT_JWKS:-{"keys":[]}}', {});
    expect(result.yaml).toBe('jwks: {"keys":[]}');
    expect(result.missingVariables).toEqual([]);
  });

  it("prefers an explicitly provided value over a nested-default expression, consuming the whole outer reference", () => {
    const result = interpolateComposeVariables("secret: ${JWT_JWKS:-${JWT_SECRET}}", { JWT_JWKS: "", JWT_SECRET: "shh" });
    expect(result.yaml).toBe("secret: ");
    expect(result.missingVariables).toEqual([]);
  });

  it("reports the inner variable as missing when a nested default can't be resolved either", () => {
    const result = interpolateComposeVariables("secret: ${JWT_JWKS:-${JWT_SECRET}}", {});
    expect(result.yaml).toBe("secret: ${JWT_SECRET}");
    expect(result.missingVariables).toEqual(["JWT_SECRET"]);
  });
});
