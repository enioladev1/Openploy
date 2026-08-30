import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  deployment: null as any,
  claimed: null as any,
  updateCalls: [] as any[],
  appService: null as any,
  logLines: [] as string[],
};

vi.mock("../db", () => ({
  db: {
    query: {
      deployments: { findFirst: vi.fn(async () => state.deployment) },
      applicationServices: { findFirst: vi.fn(async () => state.appService) },
    },
    update: vi.fn(() => ({
      set: (values: any) => ({
        where: (predicate: any) => ({
          returning: async () => {
            state.updateCalls.push({ values, predicate });
            // Simulates the real WHERE (id = ? AND status = 'queued') - only
            // "claims" (returns a row) when the in-memory deployment is still queued.
            if (values.status === "building" && state.deployment?.status === "queued") {
              state.claimed = { ...state.deployment, ...values };
              state.deployment = state.claimed;
              return [state.claimed];
            }
            if (values.status === "building") return [];
            state.deployment = { ...state.deployment, ...values };
            return [state.deployment];
          },
        }),
      }),
    })),
  },
}));

vi.mock("@openploy/db", () => ({
  applicationServices: { serviceId: "service-id-col" },
  deployments: { id: "id-col", status: "status-col" },
  services: { id: "id-col" },
  staticUploads: { serviceId: "service-id-col" },
}));

vi.mock("../env-vars", () => ({
  loadDecryptedEnvVars: vi.fn(async () => ({ build: {}, runtime: {}, secretValues: [] })),
}));
vi.mock("../github-token", () => ({ getInstallationTokenForRow: vi.fn(async () => "token") }));
vi.mock("../log-writer", () => ({
  createLogWriter: vi.fn(() => ({
    write: vi.fn(async (_stream: string, line: string) => {
      state.logLines.push(line);
    }),
  })),
}));
vi.mock("../redact", () => ({ buildRedactor: vi.fn(() => (line: string) => line) }));
vi.mock("../service-lifecycle", () => ({ finalizeServiceRunState: vi.fn(async () => "running") }));
vi.mock("../notifications", () => ({ notifyServiceEvent: vi.fn(async () => {}) }));
vi.mock("../static-upload", () => ({ extractZipToDirectory: vi.fn(async () => {}) }));
vi.mock("../traefik-sync", () => ({ syncDomainsForService: vi.fn(async () => {}) }));
vi.mock("@openploy/github", () => ({
  downloadAndExtractSource: vi.fn(async () => {}),
  getLatestCommit: vi.fn(async () => ({ sha: "abc123", message: "msg", author: "someone" })),
}));

const buildDockerfileImageMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@openploy/docker", () => ({
  buildDockerfileImage: (...args: unknown[]) => buildDockerfileImageMock(...args),
  buildWithHerokuBuildpacks: vi.fn(async () => {}),
  createOrUpdateService: vi.fn(async () => {}),
  pushImage: vi.fn(async () => {}),
}));

const { processDeployApplicationJob } = await import("./deploy-application");

function appServiceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    serviceId: "svc-1",
    sourceType: "repo",
    githubInstallationId: "install-1",
    repoOwner: "owner",
    repoName: "repo",
    branch: "main",
    buildMethod: "dockerfile",
    dockerfileDirectory: "/",
    cpuLimit: 1,
    memoryLimitMb: 512,
    ...overrides,
  };
}

describe("processDeployApplicationJob claim guard", () => {
  beforeEach(() => {
    state.deployment = null;
    state.claimed = null;
    state.updateCalls = [];
    state.appService = appServiceRow();
    state.logLines = [];
    buildDockerfileImageMock.mockClear();
    buildDockerfileImageMock.mockImplementation(async () => {});
  });

  it("claims a queued deployment and proceeds to build", async () => {
    state.deployment = { id: "dep-1", serviceId: "svc-1", status: "queued", commitSha: "abc123" };

    await processDeployApplicationJob({ deploymentId: "dep-1" } as any);

    expect(buildDockerfileImageMock).toHaveBeenCalledOnce();
  });

  it("skips a redelivered job for a deployment that's already building - never starts a second concurrent build", async () => {
    // Simulates a pg-boss redelivery: another invocation already flipped this
    // row from queued to building (still legitimately in flight).
    state.deployment = { id: "dep-1", serviceId: "svc-1", status: "building", commitSha: "abc123" };

    await processDeployApplicationJob({ deploymentId: "dep-1" } as any);

    expect(buildDockerfileImageMock).not.toHaveBeenCalled();
  });

  it("skips a redelivered job for a deployment that already finished", async () => {
    state.deployment = { id: "dep-1", serviceId: "svc-1", status: "success", commitSha: "abc123" };

    await processDeployApplicationJob({ deploymentId: "dep-1" } as any);

    expect(buildDockerfileImageMock).not.toHaveBeenCalled();
  });

  it("logs a cancellation and never marks the deployment 'failed' when the build was aborted by a user cancel", async () => {
    state.deployment = { id: "dep-1", serviceId: "svc-1", status: "queued", commitSha: "abc123" };
    // Simulates deployments.cancel flipping the row mid-build (the watcher
    // would have polled this and aborted the real subprocess; here the build
    // call itself just throws the way an aborted spawn() rejects).
    buildDockerfileImageMock.mockImplementation(async () => {
      state.deployment.status = "canceled";
      throw new Error("Canceled");
    });

    await processDeployApplicationJob({ deploymentId: "dep-1" } as any);

    expect(state.updateCalls.some((c) => c.values.status === "failed")).toBe(false);
    expect(state.logLines).toContain("Deployment canceled");
  });
});
