export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
  return slug || "app";
}

/**
 * Openploy-style instant domain: <service-slug>-<random>-<ip-dashed>.nip.io.
 * nip.io resolves that literally (no DNS record to create), and since it
 * points at this server's real public IP, Traefik's normal HTTP-01 flow
 * still works for the TLS cert - this isn't a special case, just a
 * host string createDomain has never seen a user type manually.
 */
export function buildNipIoHost(serviceName: string, publicIp: string, randomSuffix: string): string {
  return `${slugify(serviceName)}-${randomSuffix}-${publicIp.replace(/\./g, "-")}.nip.io`;
}
