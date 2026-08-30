import { describe, expect, it } from "vitest";
import { renderTraefikStaticConfig } from "./static-config";

describe("renderTraefikStaticConfig", () => {
  it("interpolates the given email into the acme.email field", () => {
    const config = renderTraefikStaticConfig("admin@example.com");
    expect(config).toContain('email: "admin@example.com"');
  });

  it("always points storage and the dynamic provider at the same fixed paths", () => {
    const config = renderTraefikStaticConfig("a@b.com");
    expect(config).toContain("storage: /etc/traefik/acme/acme.json");
    expect(config).toContain("directory: /etc/traefik/dynamic");
  });

  it("keeps the traefik entrypoint bound to loopback only, never publicly exposed", () => {
    const config = renderTraefikStaticConfig("a@b.com");
    expect(config).toContain('address: "127.0.0.1:8080"');
  });
});
