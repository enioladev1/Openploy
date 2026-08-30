import type { AiProviderKind } from "@openploy/shared";

export interface AiModel {
  id: string;
  label: string;
}

export interface AiProviderConfig {
  provider: AiProviderKind;
  apiUrl: string;
  apiKey: string;
  model: string;
}
