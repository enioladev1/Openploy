import { getDockerClient } from "./client";
import { pullImageWithProgress } from "./pull-image";

// Traefik's own image ships no shell (its official image has no /bin/sh) so
// exec'ing into the running Traefik container to touch its own config isn't
// possible - a throwaway alpine container with the same volumes mounted is
// the only way to write files into a volume the agent's own container
// doesn't otherwise have access to. Pinned for reproducibility.
const HELPER_IMAGE = "alpine:3.20";

// Production names these Docker-managed named volumes (traefik_static,
// traefik_acme); a bind-mounted host directory works too (used by local dev
// setups) - Docker volume names never start with "/", so this is a reliable
// way to accept either without a separate "is this a volume or a bind" flag.
function mountType(source: string): "bind" | "volume" {
  return source.startsWith("/") ? "bind" : "volume";
}

/**
 * Rewrites Traefik's static config file and clears its stored ACME account -
 * both live in Docker volumes only the Traefik service itself normally
 * mounts. Content is passed via an env var (not baked into Cmd) so arbitrary
 * YAML content never needs shell-escaping.
 *
 * Wiping acme.json is required, not optional: Traefik only registers a new
 * ACME account when none exists in storage - simply changing `email` in
 * config and restarting reuses whatever account is already on disk, silently
 * ignoring the new address. Losing already-issued certs here is cheap: this
 * only ever runs when the ACME email is being set for the first time or
 * changed, at which point Traefik just re-requests them under the new account.
 */
export async function rewriteTraefikStaticConfig(
  staticVolumeName: string,
  acmeVolumeName: string,
  traefikYmlContent: string,
): Promise<void> {
  const docker = getDockerClient();
  await pullImageWithProgress(HELPER_IMAGE, () => {});

  const container = await docker.createContainer({
    Image: HELPER_IMAGE,
    Env: [`TRAEFIK_YML=${traefikYmlContent}`],
    Cmd: ["sh", "-c", 'printf "%s" "$TRAEFIK_YML" > /etc/traefik/traefik.yml && rm -f /etc/traefik/acme/acme.json'],
    HostConfig: {
      Mounts: [
        { Type: mountType(staticVolumeName), Source: staticVolumeName, Target: "/etc/traefik" },
        { Type: mountType(acmeVolumeName), Source: acmeVolumeName, Target: "/etc/traefik/acme" },
      ],
    },
  });

  try {
    await container.start();
    const result = (await container.wait()) as { StatusCode: number };
    if (result.StatusCode !== 0) throw new Error(`Failed to rewrite Traefik static config (exit ${result.StatusCode})`);
  } finally {
    await container.remove().catch(() => undefined);
  }
}
