import { beforeEach, describe, expect, it, vi } from "vitest";

const chatCompletionMock = vi.fn(async (..._args: [unknown, string, string]) => "analysis text");
vi.mock("./chat", () => ({ chatCompletion: (...args: [unknown, string, string]) => chatCompletionMock(...args) }));

const { debugLogs, truncateLog } = await import("./debug-logs");

beforeEach(() => {
  chatCompletionMock.mockClear();
});

describe("truncateLog", () => {
  it("passes short logs through unchanged", () => {
    const log = "line 1\nline 2\nline 3";
    expect(truncateLog(log)).toBe(log);
  });

  it("keeps only the last 400 lines when over the line limit, with a truncation marker", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i}`);
    const result = truncateLog(lines.join("\n"));
    expect(result.startsWith("[... earlier output truncated ...]\n")).toBe(true);
    const body = result.slice("[... earlier output truncated ...]\n".length);
    expect(body.split("\n")).toHaveLength(400);
    expect(body.split("\n")[0]).toBe("line 100");
    expect(body.split("\n").at(-1)).toBe("line 499");
  });

  it("does not truncate at exactly the line limit", () => {
    const lines = Array.from({ length: 400 }, (_, i) => `line ${i}`);
    const result = truncateLog(lines.join("\n"));
    expect(result).toBe(lines.join("\n"));
  });

  it("hard-caps to 15000 characters even when under the line limit (one very long line)", () => {
    const longLine = "x".repeat(20000);
    const result = truncateLog(longLine);
    expect(result.startsWith("[... earlier output truncated ...]\n")).toBe(true);
    const body = result.slice("[... earlier output truncated ...]\n".length);
    expect(body.length).toBe(15000);
    expect(body).toBe(longLine.slice(-15000));
  });
});

describe("debugLogs", () => {
  it("sends the truncated log as the user message with a fixed system prompt", async () => {
    await debugLogs({ provider: "openai", apiUrl: "u", apiKey: "k", model: "m" }, "line 1\nline 2");

    expect(chatCompletionMock).toHaveBeenCalledTimes(1);
    const [config, system, userMessage] = chatCompletionMock.mock.calls[0] as [unknown, string, string];
    expect(config).toEqual({ provider: "openai", apiUrl: "u", apiKey: "k", model: "m" });
    expect(system).toContain("debugging assistant");
    expect(userMessage).toContain("line 1\nline 2");
  });

  it("returns the AI's response text", async () => {
    await expect(debugLogs({ provider: "openai", apiUrl: "u", apiKey: "k", model: "m" }, "log")).resolves.toBe("analysis text");
  });
});
