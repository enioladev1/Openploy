import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  row: undefined as { host: string; certificateId: string | null } | undefined,
  writeCalls: [] as unknown[],
  removeCalls: [] as unknown[],
};

vi.mock("../db", () => ({
  db: {
    query: {
      platformDomains: { findFirst: vi.fn(async () => state.row) },
    },
  },
}));

vi.mock("@openploy/traefik", () => ({
  writeDomainConfig: vi.fn(async (_dir: string, route: unknown) => {
    state.writeCalls.push(route);
  }),
  removeDomainConfig: vi.fn(async (_dir: string, domainId: string) => {
    state.removeCalls.push(domainId);
  }),
}));

const { processSyncPlatformDomainJob } = await import("./sync-platform-domain");

describe("processSyncPlatformDomainJob", () => {
  beforeEach(() => {
    state.row = undefined;
    state.writeCalls = [];
    state.removeCalls = [];
  });

  it("removes the config file when no platform domain is set", async () => {
    await processSyncPlatformDomainJob();
    expect(state.removeCalls).toEqual(["platform-dashboard"]);
    expect(state.writeCalls).toEqual([]);
  });

  it("writes a TLS-enabled route pointing at openploy_web when a domain with a certificate is set", async () => {
    state.row = { host: "dashboard.example.com", certificateId: "cert-1" };
    await processSyncPlatformDomainJob();
    expect(state.writeCalls).toEqual([
      {
        domainId: "platform-dashboard",
        host: "dashboard.example.com",
        path: "/",
        targetServiceName: "openploy_web",
        targetPort: 3000,
        certResolver: "letsencrypt",
      },
    ]);
  });

  it("writes a non-TLS route when the domain has no certificate", async () => {
    state.row = { host: "dashboard.example.com", certificateId: null };
    await processSyncPlatformDomainJob();
    expect(state.writeCalls[0]).toMatchObject({ certResolver: null });
  });
});
