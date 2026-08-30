import { beforeEach, describe, expect, it, vi } from "vitest";

const openAiChatCompletionMock = vi.fn(async (..._args: unknown[]) => "openai response");
const openAiListModelsMock = vi.fn(async (..._args: unknown[]) => [{ id: "gpt-4o-mini", label: "gpt-4o-mini" }]);
vi.mock("./openai-compatible", () => ({
  chatCompletion: (...args: unknown[]) => openAiChatCompletionMock(...args),
  listModels: (...args: unknown[]) => openAiListModelsMock(...args),
}));

const anthropicChatCompletionMock = vi.fn(async (..._args: unknown[]) => "anthropic response");
const anthropicListModelsMock = vi.fn(async (..._args: unknown[]) => [{ id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" }]);
vi.mock("./anthropic", () => ({
  chatCompletion: (...args: unknown[]) => anthropicChatCompletionMock(...args),
  listModels: (...args: unknown[]) => anthropicListModelsMock(...args),
}));

const { chatCompletion, listModels } = await import("./chat");

beforeEach(() => {
  openAiChatCompletionMock.mockClear();
  anthropicChatCompletionMock.mockClear();
  openAiListModelsMock.mockClear();
  anthropicListModelsMock.mockClear();
});

describe("chatCompletion dispatch", () => {
  it("routes openai to the openai-compatible client", async () => {
    const config = { provider: "openai" as const, apiUrl: "u", apiKey: "k", model: "m" };
    await expect(chatCompletion(config, "sys", "user")).resolves.toBe("openai response");
    expect(openAiChatCompletionMock).toHaveBeenCalledWith(config, [
      { role: "system", content: "sys" },
      { role: "user", content: "user" },
    ]);
    expect(anthropicChatCompletionMock).not.toHaveBeenCalled();
  });

  it("routes openrouter to the openai-compatible client", async () => {
    const config = { provider: "openrouter" as const, apiUrl: "u", apiKey: "k", model: "m" };
    await chatCompletion(config, "sys", "user");
    expect(openAiChatCompletionMock).toHaveBeenCalled();
    expect(anthropicChatCompletionMock).not.toHaveBeenCalled();
  });

  it("routes anthropic to the anthropic client", async () => {
    const config = { provider: "anthropic" as const, apiUrl: "u", apiKey: "k", model: "m" };
    await expect(chatCompletion(config, "sys", "user")).resolves.toBe("anthropic response");
    expect(anthropicChatCompletionMock).toHaveBeenCalledWith(config, "sys", "user");
    expect(openAiChatCompletionMock).not.toHaveBeenCalled();
  });
});

describe("listModels dispatch", () => {
  it("routes anthropic to the anthropic client", async () => {
    const models = await listModels({ provider: "anthropic", apiUrl: "u", apiKey: "k" });
    expect(models).toEqual([{ id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" }]);
    expect(openAiListModelsMock).not.toHaveBeenCalled();
  });

  it("routes openai and openrouter to the openai-compatible client", async () => {
    await listModels({ provider: "openai", apiUrl: "u", apiKey: "k" });
    await listModels({ provider: "openrouter", apiUrl: "u", apiKey: "k" });
    expect(openAiListModelsMock).toHaveBeenCalledTimes(2);
    expect(anthropicListModelsMock).not.toHaveBeenCalled();
  });
});
