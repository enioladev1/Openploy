import type { AiModel } from "./types";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

function headers(apiKey: string) {
  return { "content-type": "application/json", authorization: `Bearer ${apiKey}` };
}

function baseUrl(apiUrl: string): string {
  return apiUrl.replace(/\/$/, "");
}

/** Covers both "openai" and "openrouter" kinds - OpenRouter's API is OpenAI-compatible. */
export async function chatCompletion(
  config: { apiUrl: string; apiKey: string; model: string },
  messages: ChatMessage[],
): Promise<string> {
  const response = await fetch(`${baseUrl(config.apiUrl)}/chat/completions`, {
    method: "POST",
    headers: headers(config.apiKey),
    body: JSON.stringify({ model: config.model, messages }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`AI provider request failed (${response.status}): ${body.slice(0, 500)}`);
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI provider returned no content");
  return content;
}

export async function listModels(config: { apiUrl: string; apiKey: string }): Promise<AiModel[]> {
  const response = await fetch(`${baseUrl(config.apiUrl)}/models`, { headers: headers(config.apiKey) });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to list models (${response.status}): ${body.slice(0, 500)}`);
  }
  const data = (await response.json()) as { data?: Array<{ id: string; name?: string }> };
  return (data.data ?? [])
    .map((model) => ({ id: model.id, label: model.name ?? model.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
