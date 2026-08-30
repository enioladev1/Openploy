import { chatCompletion } from "./chat";
import type { AiProviderConfig } from "./types";

/** Sends one minimal real message through the given (not-yet-saved) config - the same call path a real debug request uses. */
export async function testAiProviderConnection(config: AiProviderConfig): Promise<void> {
  await chatCompletion(config, "You are a connection test.", "Reply with the single word OK.");
}
