import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatCompletion, listModels } from "./openai-compatible";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("chatCompletion", () => {
  it("posts to /chat/completions with a bearer token and returns the message content", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "the answer" } }] }),
    });

    const result = await chatCompletion(
      { apiUrl: "https://api.openai.com/v1", apiKey: "sk-test", model: "gpt-4o-mini" },
      [{ role: "system", content: "sys" }, { role: "user", content: "hi" }],
    );

    expect(result).toBe("the answer");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer sk-test" }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).toEqual({ model: "gpt-4o-mini", messages: [{ role: "system", content: "sys" }, { role: "user", content: "hi" }] });
  });

  it("strips a trailing slash from apiUrl", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) });
    await chatCompletion({ apiUrl: "https://api.openai.com/v1/", apiKey: "k", model: "m" }, []);
    expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/chat/completions", expect.anything());
  });

  it("throws with the response body on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => "invalid api key" });
    await expect(chatCompletion({ apiUrl: "https://api.openai.com/v1", apiKey: "bad", model: "m" }, [])).rejects.toThrow(/401/);
  });

  it("throws when the response has no message content", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) });
    await expect(chatCompletion({ apiUrl: "https://api.openai.com/v1", apiKey: "k", model: "m" }, [])).rejects.toThrow(/no content/);
  });
});

describe("listModels", () => {
  it("fetches /models and sorts by id", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-4o-mini" }, { id: "gpt-3.5-turbo" }] }),
    });

    const models = await listModels({ apiUrl: "https://api.openai.com/v1", apiKey: "k" });

    expect(models).toEqual([
      { id: "gpt-3.5-turbo", label: "gpt-3.5-turbo" },
      { id: "gpt-4o-mini", label: "gpt-4o-mini" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/models", expect.objectContaining({ headers: expect.anything() }));
  });

  it("uses the name field as label when present (OpenRouter shape)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: "openai/gpt-4o-mini", name: "GPT-4o mini" }] }) });
    const models = await listModels({ apiUrl: "https://openrouter.ai/api/v1", apiKey: "k" });
    expect(models).toEqual([{ id: "openai/gpt-4o-mini", label: "GPT-4o mini" }]);
  });

  it("throws on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => "forbidden" });
    await expect(listModels({ apiUrl: "https://api.openai.com/v1", apiKey: "bad" })).rejects.toThrow(/403/);
  });
});
