import { eq } from "drizzle-orm";
import { domains } from "@openploy/db";
import { writeDomainConfig } from "@openploy/traefik";
import { db } from "./db";

function getDynamicConfigDir(): string {
  return process.env.TRAEFIK_DYNAMIC_CONFIG_DIR ?? "/etc/traefik/dynamic";
}

/** Re-renders every domain's routing rule for a service - called after every successful deploy. */
export async function syncDomainsForService(serviceId: string, targetServiceName: string): Promise<void> {
  const domainRows = await db.query.domains.findMany({ where: eq(domains.serviceId, serviceId) });
  const dynamicConfigDir = getDynamicConfigDir();

  for (const domain of domainRows) {
    await writeDomainConfig(dynamicConfigDir, {
      domainId: domain.id,
      host: domain.host,
      path: domain.path,
      targetServiceName,
      targetPort: domain.targetPort ?? 80,
      // "letsencrypt" is the resolver name the installer configures in Traefik's
      // static config; a domain without a certificate row is served plain HTTP.
      certResolver: domain.certificateId ? "letsencrypt" : null,
    });
  }
}
