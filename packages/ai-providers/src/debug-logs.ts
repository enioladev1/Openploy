import { chatCompletion } from "./chat";
import type { AiProviderConfig } from "./types";

const MAX_LINES = 400;
const MAX_CHARS = 15000;
const TRUNCATION_MARKER = "[... earlier output truncated ...]";

const SYSTEM_PROMPT =
  "You are a deployment debugging assistant for a self-hosted PaaS called Openploy. You will be shown the tail of a " +
  "build or container log. Identify the most likely cause of failure (or confirm the log looks healthy) and suggest " +
  "a concrete fix. Be concise and specific.";

/** Keeps only the tail of the log - both for provider context-window limits and cost. Line cap first, then a hard char cap in case the surviving lines are still huge (e.g. one very long line). */
export function truncateLog(logText: string): string {
  const lines = logText.split("\n");
  let truncated = lines.length > MAX_LINES;
  let result = truncated ? lines.slice(-MAX_LINES).join("\n") : logText;

  if (result.length > MAX_CHARS) {
    truncated = true;
    result = result.slice(result.length - MAX_CHARS);
  }

  return truncated ? `${TRUNCATION_MARKER}\n${result}` : result;
}

export async function debugLogs(config: AiProviderConfig, logText: string): Promise<string> {
  const truncated = truncateLog(logText);
  return chatCompletion(config, SYSTEM_PROMPT, `Here is the log:\n\n${truncated}`);
}
