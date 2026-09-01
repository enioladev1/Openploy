export interface InterpolationResult {
  yaml: string;
  missingVariables: string[];
}

// Matches ${VAR}, ${VAR:-default}/${VAR-default}, and ${VAR:?err}/${VAR?err} -
// the forms almost all real compose files actually use. Bare $VAR (no braces)
// is deliberately not supported - it's ambiguous to substitute safely in
// arbitrary YAML text and compose itself recommends the braced form.
const VARIABLE_EXPRESSION = /^([A-Za-z_][A-Za-z0-9_]*)(?:(:-|-|:\?|\?)([\s\S]*))?$/;

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
 *
 * Scans char-by-char with brace-depth tracking rather than a single regex -
 * a naive `[^}]*` default-value capture stops at the *first* `}`, which
 * truncates real-world defaults like `${VAR:-{"keys":[]}}` (literal JSON) or
 * `${VAR:-${OTHER}}` (a nested variable reference), leaving a stray `}`
 * behind in the output and breaking the YAML. Real compose files use both -
 * see the Supabase self-hosted stack's `PGRST_JWT_SECRET: ${JWT_JWKS:-${JWT_SECRET}}`.
 */
export function interpolateComposeVariables(rawYaml: string, vars: Record<string, string>): InterpolationResult {
  const missingVariables = new Set<string>();
  const yaml = interpolate(rawYaml, vars, missingVariables);
  return { yaml, missingVariables: [...missingVariables] };
}

function interpolate(text: string, vars: Record<string, string>, missingVariables: Set<string>): string {
  let result = "";
  let i = 0;

  while (i < text.length) {
    if (text[i] === "$" && text[i + 1] === "{") {
      const end = findMatchingBrace(text, i + 1);
      if (end === -1) {
        // No closing brace anywhere - not a real variable reference, copy through as-is.
        result += text[i];
        i += 1;
        continue;
      }
      result += resolveExpression(text.slice(i, end + 1), text.slice(i + 2, end), vars, missingVariables);
      i = end + 1;
    } else {
      result += text[i];
      i += 1;
    }
  }

  return result;
}

/** Index of the `}` matching the `{` at openIndex, counting nested `{`/`}` pairs (JSON defaults, nested ${...} refs) - or -1 if unbalanced. */
function findMatchingBrace(text: string, openIndex: number): number {
  let depth = 1;
  for (let j = openIndex + 1; j < text.length; j++) {
    if (text[j] === "{") depth += 1;
    else if (text[j] === "}") {
      depth -= 1;
      if (depth === 0) return j;
    }
  }
  return -1;
}

function resolveExpression(
  original: string,
  inner: string,
  vars: Record<string, string>,
  missingVariables: Set<string>,
): string {
  const parsed = VARIABLE_EXPRESSION.exec(inner);
  if (!parsed) return original; // not a recognizable ${VAR...} shape - leave untouched, same as the old regex simply not matching it

  const [, varName, operator, rest] = parsed as unknown as [string, string, string | undefined, string | undefined];
  if (Object.prototype.hasOwnProperty.call(vars, varName)) return vars[varName]!;
  if (operator === "-" || operator === ":-") {
    // The default itself may contain further ${...} references or literal
    // {..} text (JSON) - re-scan it rather than trusting it's already resolved.
    return interpolate(rest ?? "", vars, missingVariables);
  }
  missingVariables.add(varName);
  return original;
}
