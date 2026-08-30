export interface InterpolationResult {
  yaml: string;
  missingVariables: string[];
}

// Matches ${VAR}, ${VAR:-default}/${VAR-default}, and ${VAR:?err}/${VAR?err} -
// the forms almost all real compose files actually use. Bare $VAR (no braces)
// is deliberately not supported - it's ambiguous to substitute safely in
// arbitrary YAML text and compose itself recommends the braced form.
const VARIABLE_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:-|-|:\?|\?)([^}]*))?\}/g;

/**
 * Text-level substitution, matching how Docker Compose itself resolves
 * variables (before YAML parsing, not scoped to any one service) - a
 * ${N8N_HOST} reference can appear anywhere in the file, not just inside one
 * service's environment: block, so this must run on the raw string.
 *
 * This must be the ONLY place compose variables get resolved. The agent's
 * `docker stack deploy` subprocess inherits its own OS environment, never
 * this service's decrypted env vars (mixing a service's secrets into the
 * agent's shared process environment would leak across concurrent deploys of
 * other services) - so any ${VAR} syntax left unresolved by this function is
 * silently invisible to Docker and fails non-deterministically (Go's
 * randomized map iteration order picks whichever undefined var it hits
 * first). ${VAR:?msg}/${VAR?msg} (Compose's own "required" syntax) is
 * therefore handled here too, not left for Docker to reject.
 *
 * A required variable with no value in `vars` (no default, or an explicit
 * :?/? marker) is left as the literal ${VAR...} placeholder and reported in
 * missingVariables, rather than silently substituting an empty string -
 * deploying a stack with a silently blank value for something like a
 * database host is worse than failing loudly.
 */
export function interpolateComposeVariables(rawYaml: string, vars: Record<string, string>): InterpolationResult {
  const missingVariables = new Set<string>();

  const yaml = rawYaml.replace(
    VARIABLE_PATTERN,
    (match, varName: string, operator: string | undefined, rest: string | undefined) => {
      if (Object.prototype.hasOwnProperty.call(vars, varName)) return vars[varName]!;
      if (operator === "-" || operator === ":-") return rest ?? "";
      missingVariables.add(varName);
      return match;
    },
  );

  return { yaml, missingVariables: [...missingVariables] };
}
