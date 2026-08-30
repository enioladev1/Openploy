export interface ParsedEnvEntry {
  key: string;
  value: string;
}

/**
 * Parses pasted .env-style text (KEY=VALUE per line) for the bulk env var
 * editor. Follows common dotenv conventions: blank lines and #-comments are
 * skipped, only the first "=" splits key from value (so values may contain
 * "="), and a value wrapped in matching quotes has them stripped.
 */
export function parseEnvFileText(text: string): ParsedEnvEntry[] {
  const entries: ParsedEnvEntry[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    const isQuoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
    if (isQuoted) value = value.slice(1, -1);

    if (key) entries.push({ key, value });
  }

  return entries;
}

/** Inverse of parseEnvFileText, for rendering the current stored values back into the textarea. */
export function formatEnvFileText(entries: ParsedEnvEntry[]): string {
  return entries.map((entry) => `${entry.key}=${entry.value}`).join("\n");
}
