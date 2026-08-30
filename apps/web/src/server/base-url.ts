import "server-only";
import { getPlatformDomain } from "./services/platform-domain-service";

/**
 * The one source of truth for this instance's public URL. Never derive it
 * from an incoming request's own URL/Host header - behind a reverse proxy
 * (ngrok in dev, Traefik in production) that reflects the proxy's local
 * target, not the public address GitHub actually needs to redirect back to.
 */
export function getAppBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) throw new Error("APP_BASE_URL is not set");
  return url;
}

/**
 * Prefers the admin-configured dashboard domain over the install-time env
 * var - APP_BASE_URL never changes after install, so anything sent to a
 * third party (GitHub App manifest, OAuth redirects) must use this instead
 * or it'll keep pointing at the original nip.io domain forever. Falls back
 * to the static value only for the brief window before a platformDomains
 * row exists (install.sh's bootstrap step creates one right after migrations).
 */
export async function getEffectiveBaseUrl(): Promise<string> {
  const domain = await getPlatformDomain();
  if (domain) return `https://${domain.host}`;
  return getAppBaseUrl();
}

/**
 * The single-server install's own public IPv4 - used to auto-generate
 * nip.io domains. Deliberately an env var (set by install.sh, which already
 * has to know this for the same reasons APP_BASE_URL exists) rather than the
 * `servers` table: that table exists for the *additional* worker-server-join
 * flow, and has no row representing the manager node itself yet.
 */
export function getPlatformPublicIp(): string {
  const ip = process.env.PLATFORM_PUBLIC_IP;
  if (!ip) throw new Error("PLATFORM_PUBLIC_IP is not set");
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    throw new Error("PLATFORM_PUBLIC_IP must be a plain IPv4 address");
  }
  return ip;
}
