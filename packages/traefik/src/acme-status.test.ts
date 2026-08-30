import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDomainCertificateIssued } from "./acme-status";

// Shape matches Traefik's documented acme.json storage format:
// { "<resolverName>": { "Certificates": [{ "domain": { "main": "...", "sans": [...] } }] } }
const SAMPLE_ACME_JSON = {
  letsencrypt: {
    Account: { Email: "dev@example.com" },
    Certificates: [
      { domain: { main: "app.example.com" }, certificate: "base64...", key: "base64..." },
      { domain: { main: "multi.example.com", sans: ["www.multi.example.com"] } },
    ],
  },
};

describe("isDomainCertificateIssued", () => {
  let dir: string;
  let acmeJsonPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "acme-status-test-"));
    acmeJsonPath = path.join(dir, "acme.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns true for a domain present as the main domain of an issued cert", async () => {
    await writeFile(acmeJsonPath, JSON.stringify(SAMPLE_ACME_JSON), "utf8");
    const result = await isDomainCertificateIssued(acmeJsonPath, "letsencrypt", "app.example.com");
    expect(result).toBe(true);
  });

  it("returns true for a domain present only as a SAN", async () => {
    await writeFile(acmeJsonPath, JSON.stringify(SAMPLE_ACME_JSON), "utf8");
    const result = await isDomainCertificateIssued(acmeJsonPath, "letsencrypt", "www.multi.example.com");
    expect(result).toBe(true);
  });

  it("returns false for a domain with no matching certificate", async () => {
    await writeFile(acmeJsonPath, JSON.stringify(SAMPLE_ACME_JSON), "utf8");
    const result = await isDomainCertificateIssued(acmeJsonPath, "letsencrypt", "never-requested.example.com");
    expect(result).toBe(false);
  });

  it("returns false when the resolver name doesn't exist in the file", async () => {
    await writeFile(acmeJsonPath, JSON.stringify(SAMPLE_ACME_JSON), "utf8");
    const result = await isDomainCertificateIssued(acmeJsonPath, "some-other-resolver", "app.example.com");
    expect(result).toBe(false);
  });

  it("returns false when the file doesn't exist yet (no certs issued at all)", async () => {
    const result = await isDomainCertificateIssued(path.join(dir, "does-not-exist.json"), "letsencrypt", "app.example.com");
    expect(result).toBe(false);
  });

  it("returns false gracefully when the file contains invalid JSON", async () => {
    await writeFile(acmeJsonPath, "{ not valid json", "utf8");
    const result = await isDomainCertificateIssued(acmeJsonPath, "letsencrypt", "app.example.com");
    expect(result).toBe(false);
  });
});
