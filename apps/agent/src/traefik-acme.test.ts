import { beforeEach, describe, expect, it, vi } from "vitest";

const rewriteTraefikStaticConfigMock = vi.fn(async (..._args: unknown[]) => undefined);
const restartServiceMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@openploy/docker", () => ({
  rewriteTraefikStaticConfig: (...args: unknown[]) => rewriteTraefikStaticConfigMock(...args),
  restartService: (...args: unknown[]) => restartServiceMock(...args),
}));

vi.mock("@openploy/traefik", () => ({
  renderTraefikStaticConfig: (email: string) => `rendered-config-for-${email}`,
}));

const { setAcmeEmail } = await import("./traefik-acme");

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  rewriteTraefikStaticConfigMock.mockClear();
  restartServiceMock.mockClear();
  process.env = { ...ORIGINAL_ENV };
});

describe("setAcmeEmail", () => {
  it("rewrites the static config with the rendered content, then restarts traefik", async () => {
    delete process.env.TRAEFIK_STATIC_VOLUME;
    delete process.env.TRAEFIK_ACME_VOLUME;
    delete process.env.TRAEFIK_SERVICE_NAME;

    await setAcmeEmail("admin@example.com");

    expect(rewriteTraefikStaticConfigMock).toHaveBeenCalledWith(
      "traefik_static",
      "traefik_acme",
      "rendered-config-for-admin@example.com",
    );
    expect(restartServiceMock).toHaveBeenCalledWith("openploy_traefik");
  });

  it("uses overridden volume/service names from env vars when set", async () => {
    process.env.TRAEFIK_STATIC_VOLUME = "/private/tmp/openploy-traefik-static";
    process.env.TRAEFIK_ACME_VOLUME = "/private/tmp/openploy-traefik-acme";
    process.env.TRAEFIK_SERVICE_NAME = "traefik-dev";

    await setAcmeEmail("dev@example.com");

    expect(rewriteTraefikStaticConfigMock).toHaveBeenCalledWith(
      "/private/tmp/openploy-traefik-static",
      "/private/tmp/openploy-traefik-acme",
      "rendered-config-for-dev@example.com",
    );
    expect(restartServiceMock).toHaveBeenCalledWith("traefik-dev");
  });

  it("restarts traefik only after the rewrite resolves, not before", async () => {
    const callOrder: string[] = [];
    rewriteTraefikStaticConfigMock.mockImplementationOnce(async () => {
      callOrder.push("rewrite");
    });
    restartServiceMock.mockImplementationOnce(async () => {
      callOrder.push("restart");
    });

    await setAcmeEmail("admin@example.com");

    expect(callOrder).toEqual(["rewrite", "restart"]);
  });
});
