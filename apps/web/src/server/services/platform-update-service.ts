import "server-only";
import { eq } from "drizzle-orm";
import { platformSettings } from "@openploy/db";
import { JOB_CHECK_PLATFORM_UPDATE, JOB_PERFORM_PLATFORM_UPDATE } from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { logAuditEvent } from "../audit";
import { db } from "../db";
import { ValidationError } from "../errors";

// web never touches Docker (see the plan's security section) - this is the
// only source of truth the sidebar/dialog read, written entirely by
// apps/agent's check/perform-platform-update workers.
export async function getPlatformUpdateStatus() {
  const row = await db.query.platformSettings.findFirst();
  return {
    updateAvailable: row?.updateAvailable ?? false,
    updateStatus: row?.updateStatus ?? "idle",
    updateCheckedAt: row?.updateCheckedAt ?? null,
    updateStartedAt: row?.updateStartedAt ?? null,
    updateFinishedAt: row?.updateFinishedAt ?? null,
    updateError: row?.updateError ?? null,
    currentWebVersion: row?.currentWebVersion ?? null,
    currentAgentVersion: row?.currentAgentVersion ?? null,
    latestVersion: row?.latestVersion ?? null,
  };
}

/**
 * Claims "running" here (not just relying on the worker's own first step) for
 * the same reason triggerBackupNow does - a rapid double-click must not
 * enqueue two update jobs before the agent has even picked up the first one.
 */
export async function triggerPlatformUpdate(organizationId: string, userId: string): Promise<void> {
  const existing = await db.query.platformSettings.findFirst();
  if (existing?.updateStatus === "running") {
    throw new ValidationError("An update is already running");
  }
  if (!existing?.latestVersion) {
    throw new ValidationError("No update has been detected yet - check for one first");
  }

  await db.update(platformSettings).set({ updateStatus: "running" }).where(eq(platformSettings.id, existing.id));

  await logAuditEvent(db, {
    organizationId,
    actorUserId: userId,
    action: "platform_settings.trigger_update",
    targetType: "platform_settings",
    targetId: existing.id,
    metadata: { version: existing.latestVersion },
  });

  await enqueueJob(JOB_PERFORM_PLATFORM_UPDATE, { version: existing.latestVersion });
}

/** On-demand version of the periodic tick (check-platform-update.ts) - same job, just triggered now instead of waiting. */
export async function checkPlatformUpdateNow(): Promise<void> {
  await enqueueJob(JOB_CHECK_PLATFORM_UPDATE, {});
}
