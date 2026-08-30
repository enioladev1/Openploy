import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = { status: "building" as string };

vi.mock("./db", () => ({
  db: {
    query: {
      deployments: { findFirst: vi.fn(async () => ({ status: state.status })) },
    },
  },
}));

vi.mock("@openploy/db", () => ({ deployments: { id: "id-col" } }));

const { isDeploymentCanceled, watchForCancellation } = await import("./deployment-cancellation");

describe("isDeploymentCanceled", () => {
  it("is true only once the row's status is canceled", async () => {
    state.status = "building";
    await expect(isDeploymentCanceled("dep-1")).resolves.toBe(false);

    state.status = "canceled";
    await expect(isDeploymentCanceled("dep-1")).resolves.toBe(true);
  });
});

describe("watchForCancellation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.status = "building";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts the controller once the deployment is canceled", async () => {
    const controller = new AbortController();
    const watch = watchForCancellation("dep-1", controller);

    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.signal.aborted).toBe(false);

    state.status = "canceled";
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.signal.aborted).toBe(true);

    watch.stop();
  });

  it("stops polling once stop() is called - no late abort after the caller has moved on", async () => {
    const controller = new AbortController();
    const watch = watchForCancellation("dep-1", controller);
    watch.stop();

    state.status = "canceled";
    await vi.advanceTimersByTimeAsync(10_000);

    expect(controller.signal.aborted).toBe(false);
  });
});
