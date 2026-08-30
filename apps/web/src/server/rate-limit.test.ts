import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to the limit within the window", () => {
    const key = "test-key-1";
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 1000).allowed).toBe(true);
    }
  });

  it("blocks the request after the limit is exceeded", () => {
    const key = "test-key-2";
    for (let i = 0; i < 5; i++) checkRateLimit(key, 5, 1000);
    const result = checkRateLimit(key, 5, 1000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets once the window elapses", () => {
    const key = "test-key-3";
    for (let i = 0; i < 5; i++) checkRateLimit(key, 5, 1000);
    expect(checkRateLimit(key, 5, 1000).allowed).toBe(false);

    vi.advanceTimersByTime(1001);

    expect(checkRateLimit(key, 5, 1000).allowed).toBe(true);
  });

  it("tracks distinct keys independently", () => {
    checkRateLimit("a", 1, 1000);
    expect(checkRateLimit("a", 1, 1000).allowed).toBe(false);
    expect(checkRateLimit("b", 1, 1000).allowed).toBe(true);
  });
});
