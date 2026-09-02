import "server-only";
import type { TemplateId } from "@openploy/shared";

export type TemplateEnvValue =
  | { type: "fixed"; value: string }
  // Key exists with a blank value the user fills in themselves later - e.g.
  // phpMyAdmin's DB connection, which only the user knows (there's no
  // database service to point it at automatically).
  | { type: "empty" }
  // Resolved to the nip.io host generated for this deployment (no scheme) -
  // e.g. n8n's N8N_HOST, which must match the domain actually routing to it.
  | { type: "domainHost" }
  | { type: "generatedSecret"; bytes: number };

export interface TemplateEnvVarSpec {
  key: string;
  value: TemplateEnvValue;
}

export interface TemplateDefinition {
  id: TemplateId;
  composeYaml: string;
  /** Which service inside the compose stack gets the platform's managed env vars/network and the domain route. */
  exposedInnerService: string;
  exposedPort: number;
  envVars: TemplateEnvVarSpec[];
}
