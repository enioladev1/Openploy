import { removeDomainConfig, writeDomainConfig } from "@openploy/traefik";
import { db } from "../db";

// Fixed, not derived from a row id like per-service domains - platformDomains
// is a singleton, so there's only ever one dashboard-domain config file to
// reconcile regardless of which host is currently behind it.
const PLATFORM_DOMAIN_ID = "platform-dashboard";

function getDynamicConfigDir(): string {
  return process.env.TRAEFIK_DYNAMIC_CONFIG_DIR ?? "/etc/traefik/dynamic";
}

// install.sh always deploys the stack as "openploy" (docker stack deploy -c
// stack.yml openploy), so Swarm's own <stack>_<service> naming convention
// makes the web service's overlay-network DNS name "openploy_web" - overridable
// in case that stack name is ever changed at install time.
function getPlatformWebTarget(): { serviceName: string; port: number } {
  return {
    serviceName: process.env.PLATFORM_WEB_SERVICE_NAME ?? "openploy_web",
    port: Number(process.env.PLATFORM_WEB_PORT ?? "3000"),
  };
}

/** Re-reads the current (at most one) platformDomains row and reconciles the Traefik dynamic config file to match - same reconciliation style as check-disk-usage, not a serviceId-shaped job like sync-domains.ts since there's no service to key off of. */
export async function processSyncPlatformDomainJob(): Promise<void> {
  const dynamicConfigDir = getDynamicConfigDir();
  const row = await db.query.platformDomains.findFirst();

  if (!row) {
    await removeDomainConfig(dynamicConfigDir, PLATFORM_DOMAIN_ID);
    return;
  }

  const target = getPlatformWebTarget();
  await writeDomainConfig(dynamicConfigDir, {
    domainId: PLATFORM_DOMAIN_ID,
    host: row.host,
    path: "/",
    targetServiceName: target.serviceName,
    targetPort: target.port,
    certResolver: row.certificateId ? "letsencrypt" : null,
  });
}
