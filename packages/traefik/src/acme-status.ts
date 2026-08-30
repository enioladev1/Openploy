import { readFile } from "node:fs/promises";

interface AcmeCertificateEntry {
  domain?: { main?: string; sans?: string[] };
}

interface AcmeResolverState {
  Certificates?: AcmeCertificateEntry[];
}

/**
 * Traefik owns cert issuance entirely itself via its built-in ACME client -
 * this just reads what Traefik has actually gotten (its own acme.json
 * storage), rather than the platform's own certificates.status row trusting
 * "requested" as if it meant "issued" forever.
 */
export async function isDomainCertificateIssued(acmeJsonPath: string, resolverName: string, host: string): Promise<boolean> {
  let raw: string;
  try {
    raw = await readFile(acmeJsonPath, "utf8");
  } catch {
    return false;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }

  const resolverState = (parsed as Record<string, AcmeResolverState | undefined>)[resolverName];
  for (const cert of resolverState?.Certificates ?? []) {
    if (cert.domain?.main === host) return true;
    if (cert.domain?.sans?.includes(host)) return true;
  }
  return false;
}
