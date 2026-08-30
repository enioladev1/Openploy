import { rewriteTraefikStaticConfig, restartService } from "@openploy/docker";
import { renderTraefikStaticConfig } from "@openploy/traefik";

// install.sh always deploys the stack as "openploy" (docker stack deploy -c
// stack.yml openploy) with these exact volume/service names - same convention
// as sync-platform-domain.ts's PLATFORM_WEB_SERVICE_NAME, overridable for
// non-default install setups.
function getStaticVolume(): string {
  return process.env.TRAEFIK_STATIC_VOLUME ?? "traefik_static";
}

function getAcmeVolume(): string {
  return process.env.TRAEFIK_ACME_VOLUME ?? "traefik_acme";
}

function getTraefikServiceName(): string {
  return process.env.TRAEFIK_SERVICE_NAME ?? "openploy_traefik";
}

/**
 * Rewrites Traefik's static config with the given ACME email and forces a
 * restart so it actually re-reads it - Traefik only loads static config at
 * startup, it isn't hot-reloaded the way the dynamic per-domain files are.
 * rewriteTraefikStaticConfig also wipes the stored ACME account, which is
 * required (not optional) for the new email to actually register with Let's
 * Encrypt - see its own docstring in packages/docker.
 */
export async function setAcmeEmail(email: string): Promise<void> {
  const content = renderTraefikStaticConfig(email);
  await rewriteTraefikStaticConfig(getStaticVolume(), getAcmeVolume(), content);
  await restartService(getTraefikServiceName());
}
