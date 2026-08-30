import type { AiModel } from "./types";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 2048;

function headers(apiKey: string) {
  return { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION };
}

function baseUrl(apiUrl: string): string {
  return apiUrl.replace(/\/$/, "");
}

export async function chatCompletion(
  config: { apiUrl: string; apiKey: string; model: string },
  system: string,
  userMessage: string,
): Promise<string> {
  const response = await fetch(`${baseUrl(config.apiUrl)}/v1/messages`, {
    method: "POST",
    headers: headers(config.apiKey),
    body: JSON.stringify({
      model: config.model,
      max_tokens: DEFAULT_MAX_TOKENS,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`AI provider request failed (${response.status}): ${body.slice(0, 500)}`);
  }
  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  const textBlock = data.content?.find((block) => block.type === "text");
  if (!textBlock?.text) throw new Error("AI provider returned no content");
  return textBlock.text;
}

export async function listModels(config: { apiUrl: string; apiKey: string }): Promise<AiModel[]> {
  const response = await fetch(`${baseUrl(config.apiUrl)}/v1/models`, { headers: headers(config.apiKey) });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to list models (${response.status}): ${body.slice(0, 500)}`);
  }
  const data = (await response.json()) as { data?: Array<{ id: string; display_name?: string }> };
  return (data.data ?? [])
    .map((model) => ({ id: model.id, label: model.display_name ?? model.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
