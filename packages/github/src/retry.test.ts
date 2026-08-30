import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./retry";

function jsonResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({}), { status, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWithRetry", () => {
  it("returns immediately on a successful first attempt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://example.com", {}, { sleep: async () => undefined });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on a 429 and succeeds once the retryable response clears", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429))
      .mockResolvedValueOnce(jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await fetchWithRetry("https://example.com", {}, { sleep });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("honors the Retry-After header (in seconds) instead of the default backoff", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { "retry-after": "7" }))
      .mockResolvedValueOnce(jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await fetchWithRetry("https://example.com", {}, { sleep });

    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it("does not retry a non-retryable 4xx status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await fetchWithRetry("https://example.com", {}, { sleep });

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up and returns the last response after maxAttempts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await fetchWithRetry("https://example.com", {}, { maxAttempts: 3, sleep });

    expect(response.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("without honorRateLimitFloor, backs off a 429 quickly (no 60s floor) - safe for a request/response cycle", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429))
      .mockResolvedValueOnce(jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await fetchWithRetry("https://example.com", {}, { sleep });

    expect(sleep.mock.calls[0]![0]).toBeLessThan(60_000);
  });

  it("with honorRateLimitFloor, waits at least 60s on a 429 with no Retry-After header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429))
      .mockResolvedValueOnce(jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await fetchWithRetry("https://example.com", {}, { honorRateLimitFloor: true, sleep });

    expect(sleep).toHaveBeenCalledWith(60_000);
  });

  it("with honorRateLimitFloor, still prefers an explicit Retry-After header over the 60s floor", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { "retry-after": "5" }))
      .mockResolvedValueOnce(jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await fetchWithRetry("https://example.com", {}, { honorRateLimitFloor: true, sleep });

    expect(sleep).toHaveBeenCalledWith(5000);
  });
});
