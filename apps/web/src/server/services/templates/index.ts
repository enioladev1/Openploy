import "server-only";
import type { TemplateId } from "@openploy/shared";
import { NotFoundError } from "../../errors";
import { excalidrawTemplate } from "./excalidraw";
import { n8nTemplate } from "./n8n";
import { phpmyadminTemplate } from "./phpmyadmin";
import type { TemplateDefinition } from "./types";

export type { TemplateDefinition, TemplateEnvValue, TemplateEnvVarSpec } from "./types";

const TEMPLATES: Record<TemplateId, TemplateDefinition> = {
  n8n: n8nTemplate,
  phpmyadmin: phpmyadminTemplate,
  excalidraw: excalidrawTemplate,
};

export function getTemplateDefinition(id: TemplateId): TemplateDefinition {
  const template = TEMPLATES[id];
  if (!template) throw new NotFoundError(`Unknown template: ${id}`);
  return template;
}
