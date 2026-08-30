import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  rows: [] as any[],
  latestDeployment: null as { id: string; serviceId: string; status: string } | null,
  updated: [] as any[],
};

vi.mock("@openploy/db", () => ({
  deploymentLogs: {
    deploymentId: "deployment-id-column",
    stream: "stream-column",
    sequence: "sequence-column",
  },
  deployments: {
    id: "id-column",
    serviceId: "service-id-column",
    createdAt: "created-at-column",
    status: "status-column",
  },
}));

vi.mock("../db", () => ({
  db: {
    query: {
      deploymentLogs: {
        findMany: vi.fn(async () => state.rows),
      },
      deployments: {
        findFirst: vi.fn(async () => state.latestDeployment),
      },
    },
    update: vi.fn(() => ({
      set: (values: any) => ({
        where: () => ({
          returning: async () => {
            // Simulates the real WHERE (... AND status IN in-flight) - only
            // "updates" (returns a row) when the in-memory row is still in flight.
            const inFlight = ["queued", "building", "deploying"].includes(state.latestDeployment?.status ?? "");
            if (!inFlight) return [];
            const row = { ...state.latestDeployment, ...values };
            state.updated.push(row);
            return [row];
          },
        }),
      }),
    })),
  },
}));

const { cancelDeployment, getDeploymentLogsSince, getFullDeploymentLog, getRuntimeLogsSince, isServiceDeploying } = await import(
  "./deployment-service"
);

const deploymentId = "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d";

// The actual "does this only return the right stream" guarantee is verified
// live against real Postgres (see the session's manual verification, not
// re-derivable here without re-implementing Drizzle's query builder) - this
// test just locks in that both functions exist with the expected shape and
// don't throw, so a refactor can't silently drop one of them.
describe("deployment log stream getters", () => {
  beforeEach(() => {
    state.rows = [];
  });

  it("getDeploymentLogsSince returns whatever findMany resolves", async () => {
    state.rows = [{ id: "1", stream: "build", content: "Provisioning mysql:8.0" }];
    await expect(getDeploymentLogsSince(deploymentId, 0)).resolves.toEqual(state.rows);
  });

  it("getRuntimeLogsSince returns whatever findMany resolves", async () => {
    state.rows = [{ id: "2", stream: "runtime", content: "mysqld: ready for connections" }];
    await expect(getRuntimeLogsSince(deploymentId, 0)).resolves.toEqual(state.rows);
  });

  it("getFullDeploymentLog joins every row's content with newlines", async () => {
    state.rows = [
      { id: "1", stream: "build", content: "Building image" },
      { id: "2", stream: "build", content: "Pushing image" },
      { id: "3", stream: "build", content: "Deploy complete" },
    ];
    await expect(getFullDeploymentLog(deploymentId, "build")).resolves.toBe("Building image\nPushing image\nDeploy complete");
  });

  it("getFullDeploymentLog returns an empty string when there are no rows", async () => {
    state.rows = [];
    await expect(getFullDeploymentLog(deploymentId, "runtime")).resolves.toBe("");
  });
});

describe("isServiceDeploying", () => {
  beforeEach(() => {
    state.latestDeployment = null;
  });

  it("returns false when the service has never had a deployment", async () => {
    await expect(isServiceDeploying("svc-1")).resolves.toBe(false);
  });

  it.each(["queued", "building", "deploying"])("returns true when the latest deployment is %s", async (status) => {
    state.latestDeployment = { id: "dep-1", serviceId: "svc-1", status };
    await expect(isServiceDeploying("svc-1")).resolves.toBe(true);
  });

  it.each(["success", "failed", "canceled"])("returns false when the latest deployment is %s", async (status) => {
    state.latestDeployment = { id: "dep-1", serviceId: "svc-1", status };
    await expect(isServiceDeploying("svc-1")).resolves.toBe(false);
  });
});

describe("cancelDeployment", () => {
  beforeEach(() => {
    state.latestDeployment = null;
    state.updated = [];
  });

  it("throws NotFoundError when the deployment doesn't exist", async () => {
    await expect(cancelDeployment("svc-1", deploymentId)).rejects.toThrow("Deployment not found");
    expect(state.updated).toHaveLength(0);
  });

  it.each(["queued", "building", "deploying"])("cancels an in-flight (%s) deployment", async (status) => {
    state.latestDeployment = { id: deploymentId, serviceId: "svc-1", status };

    const result = await cancelDeployment("svc-1", deploymentId);

    expect(result).toMatchObject({ status: "canceled" });
    expect(state.updated).toHaveLength(1);
  });

  it.each(["success", "failed", "canceled"])("refuses to cancel a deployment that's already %s", async (status) => {
    state.latestDeployment = { id: deploymentId, serviceId: "svc-1", status };

    await expect(cancelDeployment("svc-1", deploymentId)).rejects.toThrow(new RegExp(`already ${status}`));
    expect(state.updated).toHaveLength(0);
  });
});
