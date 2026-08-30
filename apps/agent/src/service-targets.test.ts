import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeService {
  id: string;
  type: "application" | "database" | "compose";
}

const state = {
  service: null as FakeService | null,
  databaseService: null as { internalHost: string } | null,
  composeService: null as { exposedInnerService: string | null } | null,
  stackServiceNames: [] as string[],
};

vi.mock("./db", () => ({
  db: {
    query: {
      services: { findFirst: vi.fn(async () => state.service) },
      databaseServices: { findFirst: vi.fn(async () => state.databaseService) },
      composeServices: { findFirst: vi.fn(async () => state.composeService) },
    },
  },
}));

vi.mock("@openploy/docker", () => ({
  listServicesInStack: vi.fn(async () => state.stackServiceNames),
}));

const { resolveServiceTargets } = await import("./service-targets");

describe("resolveServiceTargets", () => {
  beforeEach(() => {
    state.service = null;
    state.databaseService = null;
    state.composeService = null;
    state.stackServiceNames = [];
  });

  it("returns 'none' when the service doesn't exist", async () => {
    const result = await resolveServiceTargets("missing-id");
    expect(result).toEqual({ kind: "none" });
  });

  it("resolves an application service to its deterministic app-<id> Swarm name", async () => {
    state.service = { id: "svc-1", type: "application" };
    const result = await resolveServiceTargets("svc-1");
    expect(result).toEqual({ kind: "single", name: "app-svc-1" });
  });

  it("resolves a database service to its stored internalHost", async () => {
    state.service = { id: "svc-2", type: "database" };
    state.databaseService = { internalHost: "db-svc-2" };
    const result = await resolveServiceTargets("svc-2");
    expect(result).toEqual({ kind: "single", name: "db-svc-2" });
  });

  it("returns 'none' for a database service missing its config row", async () => {
    state.service = { id: "svc-2", type: "database" };
    state.databaseService = null;
    const result = await resolveServiceTargets("svc-2");
    expect(result).toEqual({ kind: "none" });
  });

  it("resolves a compose service to every Swarm service in its stack, with the exposed one as primary", async () => {
    state.service = { id: "svc-3", type: "compose" };
    state.composeService = { exposedInnerService: "app" };
    state.stackServiceNames = ["stack-svc-3_app", "stack-svc-3_postgres", "stack-svc-3_redis"];

    const result = await resolveServiceTargets("svc-3");
    expect(result).toEqual({
      kind: "stack",
      names: ["stack-svc-3_app", "stack-svc-3_postgres", "stack-svc-3_redis"],
      primary: "stack-svc-3_app",
    });
  });

  it("resolves a compose service with no exposedInnerService to a stack with no primary", async () => {
    state.service = { id: "svc-3", type: "compose" };
    state.composeService = { exposedInnerService: null };
    state.stackServiceNames = ["stack-svc-3_worker"];

    const result = await resolveServiceTargets("svc-3");
    expect(result).toEqual({ kind: "stack", names: ["stack-svc-3_worker"], primary: null });
  });

  it("returns 'none' for a compose service whose stack has no services deployed yet", async () => {
    state.service = { id: "svc-3", type: "compose" };
    state.composeService = { exposedInnerService: "app" };
    state.stackServiceNames = [];

    const result = await resolveServiceTargets("svc-3");
    expect(result).toEqual({ kind: "none" });
  });
});
