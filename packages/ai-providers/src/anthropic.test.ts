import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatCompletion, listModels } from "./anthropic";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("chatCompletion", () => {
  it("posts to /v1/messages with x-api-key and anthropic-version headers", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: "the answer" }] }),
    });

    const result = await chatCompletion({ apiUrl: "https://api.anthropic.com", apiKey: "sk-ant-test", model: "claude-haiku-4-5-20251001" }, "sys prompt", "hi");

    expect(result).toBe("the answer");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-api-key": "sk-ant-test", "anthropic-version": "2023-06-01" }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).toMatchObject({
      model: "claude-haiku-4-5-20251001",
      system: "sys prompt",
      messages: [{ role: "user", content: "hi" }],
    });
  });

  it("throws with the response body on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => "invalid x-api-key" });
    await expect(chatCompletion({ apiUrl: "https://api.anthropic.com", apiKey: "bad", model: "m" }, "s", "u")).rejects.toThrow(/401/);
  });

  it("throws when there is no text content block", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ content: [{ type: "tool_use" }] }) });
    await expect(chatCompletion({ apiUrl: "https://api.anthropic.com", apiKey: "k", model: "m" }, "s", "u")).rejects.toThrow(/no content/);
  });
});

describe("listModels", () => {
  it("fetches /v1/models and uses display_name as label", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "claude-haiku-4-5-20251001", display_name: "Claude Haiku 4.5" }] }),
    });

    const models = await listModels({ apiUrl: "https://api.anthropic.com", apiKey: "k" });

    expect(models).toEqual([{ id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" }]);
    expect(fetchMock).toHaveBeenCalledWith("https://api.anthropic.com/v1/models", expect.anything());
  });

  it("throws on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => "forbidden" });
    await expect(listModels({ apiUrl: "https://api.anthropic.com", apiKey: "bad" })).rejects.toThrow(/403/);
  });
});
