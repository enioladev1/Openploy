import { certificates, getDb, platformDomains } from "@openploy/db";
import { JOB_CHECK_CERTIFICATE_STATUS, JOB_SYNC_PLATFORM_DOMAIN } from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";

/**
 * Run once by install.sh right after migrations, so a fresh install is
 * reachable at a real HTTPS domain immediately instead of leaving the
 * dashboard unreachable until someone manually configures one through a UI
 * they have no way to open yet. Skips entirely if a domain is already set -
 * never overwrites a domain the operator has since customized through the UI,
 * including on a re-run of this script (e.g. a stack redeploy).
 */
async function main() {
  const host = process.env.PLATFORM_DASHBOARD_HOST;
  if (!host) {
    console.log("[bootstrap-platform-domain] PLATFORM_DASHBOARD_HOST not set, skipping");
    return;
  }

  const db = getDb();
  const existing = await db.query.platformDomains.findFirst();
  if (existing) {
    console.log(`[bootstrap-platform-domain] a dashboard domain is already set (${existing.host}), skipping`);
    return;
  }

  const [cert] = await db
    .insert(certificates)
    .values({ domain: host, provider: "letsencrypt-http01", status: "pending" })
    .returning();

  const [row] = await db
    .insert(platformDomains)
    .values({ host, certificateId: cert?.id ?? null })
    .returning();
  if (!row) throw new Error("Failed to bootstrap the dashboard domain");

  await enqueueJob(JOB_SYNC_PLATFORM_DOMAIN, {});
  if (row.certificateId) {
    await enqueueJob(
      JOB_CHECK_CERTIFICATE_STATUS,
      { certificateId: row.certificateId, host: row.host, attempt: 1 },
      { startAfterSeconds: 10 },
    );
  }

  console.log(`[bootstrap-platform-domain] set dashboard domain to ${host}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[bootstrap-platform-domain] failed", err);
    process.exit(1);
  });
