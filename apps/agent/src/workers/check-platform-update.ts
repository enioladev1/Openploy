import { eq } from "drizzle-orm";
import { platformSettings } from "@openploy/db";
import { getLatestReleaseVersion } from "@openploy/github";
import { getImageEnvVar, getServiceImage } from "@openploy/docker";
import { db } from "../db";

// Same override convention as sync-platform-domain.ts's PLATFORM_WEB_SERVICE_NAME -
// install.sh always deploys as stack "openploy", giving these two names via
// Swarm's own <stack>_<service> convention.
function getWebServiceName(): string {
  return process.env.PLATFORM_WEB_SERVICE_NAME ?? "openploy_web";
}
function getAgentServiceName(): string {
  return process.env.PLATFORM_AGENT_SERVICE_NAME ?? "openploy_agent";
}

function getGithubOwner(): string {
  return process.env.OPENPLOY_GITHUB_OWNER ?? "enioladev1";
}
function getGithubRepo(): string {
  return process.env.OPENPLOY_GITHUB_REPO ?? "Openploy";
}

async function upsertPlatformSettings(values: Partial<typeof platformSettings.$inferInsert>): Promise<void> {
  const existing = await db.query.platformSettings.findFirst();
  if (existing) {
    await db.update(platformSettings).set(values).where(eq(platformSettings.id, existing.id));
  } else {
    await db.insert(platformSettings).values(values);
  }
}

/**
 * Cheap tick (see index.ts's scheduleJob call) - reads web's baked-in
 * OPENPLOY_VERSION off its currently-deployed image (a Dockerfile ENV isn't
 * part of a service's own spec, only what's explicitly set via
 * `environment:` - see getImageEnvVar's docstring), agent's own from its own
 * process env, and the latest published GitHub Release, never a fresh image
 * pull. Version, not digest: a digest changes on every push to main, which
 * is exactly the axis that must NOT surface as "update available" - only a
 * real release does (see the plan's context for why this replaced the
 * GHCR-digest check this session originally shipped).
 */
export async function processCheckPlatformUpdateJob(): Promise<void> {
  const [webImage, latestVersion] = await Promise.all([
    getServiceImage(getWebServiceName()),
    getLatestReleaseVersion(getGithubOwner(), getGithubRepo()),
  ]);
  const currentWebVersion = webImage ? await getImageEnvVar(webImage, "OPENPLOY_VERSION") : null;
  // The agent's own version is already known to this very process - no
  // Docker round-trip needed, and always exactly accurate.
  const currentAgentVersion = process.env.OPENPLOY_VERSION ?? null;

  const updateAvailable = currentWebVersion !== latestVersion || currentAgentVersion !== latestVersion;

  await upsertPlatformSettings({
    updateAvailable,
    updateCheckedAt: new Date(),
    currentWebVersion,
    currentAgentVersion,
    latestVersion,
  });
}
