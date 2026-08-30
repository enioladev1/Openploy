import { beforeEach, describe, expect, it, vi } from "vitest";

const chatCompletionMock = vi.fn(async (..._args: [unknown, string, string]) => "OK");
vi.mock("./chat", () => ({ chatCompletion: (...args: [unknown, string, string]) => chatCompletionMock(...args) }));

const { testAiProviderConnection } = await import("./test-connection");

beforeEach(() => {
  chatCompletionMock.mockClear();
});

describe("testAiProviderConnection", () => {
  it("sends a minimal message through the dispatcher for the given config", async () => {
    const config = { provider: "anthropic" as const, apiUrl: "u", apiKey: "k", model: "m" };
    await testAiProviderConnection(config);
    expect(chatCompletionMock).toHaveBeenCalledWith(config, expect.any(String), expect.any(String));
  });

  it("propagates the underlying client's error unchanged", async () => {
    chatCompletionMock.mockRejectedValueOnce(new Error("invalid api key"));
    await expect(testAiProviderConnection({ provider: "openai", apiUrl: "u", apiKey: "bad", model: "m" })).rejects.toThrow("invalid api key");
  });
});
