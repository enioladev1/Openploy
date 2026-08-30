import { z } from "zod";

export const aiProviderKindSchema = z.enum(["openai", "anthropic", "openrouter"]);
export type AiProviderKind = z.infer<typeof aiProviderKindSchema>;

/** Prefill values shown when a kind is picked in the create dialog - all fields stay editable, this is just a starting point. */
export const AI_PROVIDER_DEFAULTS: Record<AiProviderKind, { apiUrl: string; model: string; label: string }> = {
  openai: { apiUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", label: "OpenAI" },
  anthropic: { apiUrl: "https://api.anthropic.com", model: "claude-haiku-4-5-20251001", label: "Anthropic" },
  openrouter: { apiUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", label: "OpenRouter" },
};

export const createAiProviderInputSchema = z.object({
  name: z.string().min(1).max(200),
  provider: aiProviderKindSchema,
  apiUrl: z.string().url("Must be a valid URL"),
  model: z.string().min(1, "Model is required"),
  apiKey: z.string().min(1, "API key is required"),
});
export type CreateAiProviderInput = z.infer<typeof createAiProviderInputSchema>;

// apiKey optional - blank means keep the currently stored key, same pattern
// as updateNotificationChannelConfigSchema's secret fields.
export const updateAiProviderInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  isEnabled: z.boolean(),
  provider: aiProviderKindSchema,
  apiUrl: z.string().url("Must be a valid URL"),
  model: z.string().min(1, "Model is required"),
  apiKey: z.string().min(1).optional(),
});
export type UpdateAiProviderInput = z.infer<typeof updateAiProviderInputSchema>;

export const testAiProviderConfigInputSchema = z.object({
  provider: aiProviderKindSchema,
  apiUrl: z.string().url("Must be a valid URL"),
  model: z.string().min(1, "Model is required"),
  apiKey: z.string().min(1, "API key is required"),
});
export type TestAiProviderConfigInput = z.infer<typeof testAiProviderConfigInputSchema>;

// No `model` - this is precisely how the user picks one, so it can't be required yet.
export const listAiProviderModelsInputSchema = z.object({
  provider: aiProviderKindSchema,
  apiUrl: z.string().url("Must be a valid URL"),
  apiKey: z.string().min(1, "API key is required"),
});
export type ListAiProviderModelsInput = z.infer<typeof listAiProviderModelsInputSchema>;
