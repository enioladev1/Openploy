import { parseComposeYaml } from "@openploy/compose";

/** Best-effort, client-side only - the server re-parses and validates for real on deploy. */
export function parseComposeServiceNames(rawYaml: string): string[] {
  if (!rawYaml.trim()) return [];
  try {
    const parsed = parseComposeYaml(rawYaml);
    return Object.keys(parsed.services ?? {});
  } catch {
    return [];
  }
}
