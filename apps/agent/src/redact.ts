const GENERIC_SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /AKIA[0-9A-Z]{16}/g, // AWS access key id shape
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub token shapes (ghp_, gho_, ghu_, ghs_, ghr_)
];

/**
 * Applied to every log line before it's persisted or streamed - values of env
 * vars explicitly marked isSecret for the service currently being built/run,
 * plus generic secret-shaped patterns as a defensive fallback for anything not
 * explicitly known. The length floor is 8, not 4: even restricted to
 * isSecret=true values, a short one risks coincidentally matching ordinary
 * substrings in build output (a 4-5 char "secret" is unusual and not worth
 * the false-positive cost of mangling unrelated log text around it).
 */
export function buildRedactor(knownSecretValues: string[]): (line: string) => string {
  const meaningfulSecrets = knownSecretValues.filter((value) => value.length >= 8);

  return (line: string): string => {
    let redacted = line;
    for (const secret of meaningfulSecrets) {
      redacted = redacted.split(secret).join("***");
    }
    for (const pattern of GENERIC_SECRET_PATTERNS) {
      redacted = redacted.replace(pattern, "***");
    }
    return redacted;
  };
}
