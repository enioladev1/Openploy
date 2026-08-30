import * as anthropicClient from "./anthropic";
import * as openAiCompatibleClient from "./openai-compatible";
import type { AiModel, AiProviderConfig } from "./types";

/** Dispatches to the right client by provider kind - "openai" and "openrouter" share the OpenAI-compatible client, "anthropic" has its own request/response shape. */
export async function chatCompletion(config: AiProviderConfig, system: string, userMessage: string): Promise<string> {
  if (config.provider === "anthropic") return anthropicClient.chatCompletion(config, system, userMessage);
  return openAiCompatibleClient.chatCompletion(config, [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ]);
}

export async function listModels(config: { provider: AiProviderConfig["provider"]; apiUrl: string; apiKey: string }): Promise<AiModel[]> {
  if (config.provider === "anthropic") return anthropicClient.listModels(config);
  return openAiCompatibleClient.listModels(config);
}
