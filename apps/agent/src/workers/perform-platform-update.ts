import { eq } from "drizzle-orm";
import { platformSettings } from "@openploy/db";
import { pullImageWithProgress, runCommand, updateServiceImage } from "@openploy/docker";
import type { PerformPlatformUpdateJob } from "@openploy/shared";
import { db } from "../db";

// Same override convention as sync-platform-domain.ts's PLATFORM_WEB_SERVICE_NAME.
function getWebServiceName(): string {
  return process.env.PLATFORM_WEB_SERVICE_NAME ?? "openploy_web";
}
function getAgentServiceName(): string {
  return process.env.PLATFORM_AGENT_SERVICE_NAME ?? "openploy_agent";
}

function getWebImage(): string {
  return process.env.OPENPLOY_WEB_IMAGE ?? "ghcr.io/enioladev1/openploy-web:latest";
}
function getAgentImage(): string {
  return process.env.OPENPLOY_AGENT_IMAGE ?? "ghcr.io/enioladev1/openploy-agent:latest";
}

// Same string install.sh hardcodes for the platform's own overlay network -
// see deploy-application.ts/provision-database.ts for the other literal uses of it.
const PLATFORM_NETWORK = "platform_internal";

function log(message: string): void {
  console.log(`[perform-platform-update] ${message}`);
}

async function markPlatformSettings(values: Partial<typeof platformSettings.$inferInsert>): Promise<void> {
  const existing = await db.query.platformSettings.findFirst();
  if (existing) {
    await db.update(platformSettings).set(values).where(eq(platformSettings.id, existing.id));
  } else {
    await db.insert(platformSettings).values(values);
  }
}

/** repo:tag -> repo (strips the trailing :tag, keeping any registry host/port that itself contains a colon). */
function stripTag(image: string): string {
  const lastColon = image.lastIndexOf(":");
  const lastSlash = image.lastIndexOf("/");
  return lastColon > lastSlash ? image.slice(0, lastColon) : image;
}

/**
 * Pulls both images pinned to the target release version (never whatever
 * :latest happens to be at the moment this runs - a push to main between
 * the check that surfaced this update and the click that triggered it must
 * never change what actually gets installed), runs pending migrations
 * against the *new* agent image, then rolling-updates web and (last) agent
 * itself. Ordering is deliberate: agent updating its own Swarm service
 * kills this very process (Swarm stops the old task once the new spec
 * lands, same stop-first behavior web already relies on) - so nothing after
 * that call is guaranteed to run. The DB is marked "success" *before* that
 * call for exactly this reason; the UI reads that row, never pg-boss's own
 * job-completion state (which is left "active" forever here, the same way
 * a stuck backup job was - harmless, since nothing user-facing depends on it).
 */
export async function processPerformPlatformUpdateJob(job: PerformPlatformUpdateJob): Promise<void> {
  await markPlatformSettings({ updateStatus: "running", updateStartedAt: new Date(), updateError: null });

  const webImage = `${stripTag(getWebImage())}:${job.version}`;
  const agentImage = `${stripTag(getAgentImage())}:${job.version}`;

  try {
    log(`pulling ${job.version}`);
    await pullImageWithProgress(webImage, (line) => log(`pull ${webImage}: ${line}`));
    await pullImageWithProgress(agentImage, (line) => log(`pull ${agentImage}: ${line}`));

    log(`running migrations against ${agentImage}`);
    // The agent's own already-correct DATABASE_URL, not reconstructed from
    // POSTGRES_PASSWORD the way install.sh does - deliberately avoids the
    // whole class of blank-shell-var bugs fixed earlier this session (a
    // `docker stack deploy`'s ${VAR} interpolation only reads the invoking
    // shell's env; this runs entirely inside the already-configured process).
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is not set");
    await runCommand(
      "docker",
      ["run", "--rm", "--network", PLATFORM_NETWORK, "-e", `DATABASE_URL=${databaseUrl}`, agentImage, "pnpm", "--filter", "@openploy/db", "migrate"],
      (line) => log(`migrate: ${line}`),
    );

    log(`updating ${getWebServiceName()} to ${webImage}`);
    await updateServiceImage(getWebServiceName(), webImage);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`failed: ${message}`);
    await markPlatformSettings({ updateStatus: "failed", updateError: message.slice(0, 4000), updateFinishedAt: new Date() });
    return;
  }

  // Mark success now - everything after this point (agent updating its own
  // service) is best-effort from the DB's perspective, since the process can
  // die mid-call.
  await markPlatformSettings({
    updateStatus: "success",
    updateAvailable: false,
    updateFinishedAt: new Date(),
    currentWebVersion: job.version,
    currentAgentVersion: job.version,
  });

  log(`updating ${getAgentServiceName()} to ${agentImage} - this process will likely be replaced now`);
  await updateServiceImage(getAgentServiceName(), agentImage);
}
