import { parse } from "yaml";
import type { ComposeDocument } from "./types";

/**
 * Real YAML parsing, never string/sed templating - this is the foundation
 * every safety guarantee in validate.ts and merge.ts depends on.
 */
export function parseComposeYaml(rawYaml: string): ComposeDocument {
  const parsed: unknown = parse(rawYaml);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Compose file must parse to a YAML mapping at the top level");
  }
  return parsed as ComposeDocument;
}
