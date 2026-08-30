import { eq } from "drizzle-orm";
import { certificates } from "@openploy/db";
import { isDomainCertificateIssued } from "@openploy/traefik";
import { JOB_CHECK_CERTIFICATE_STATUS, type CheckCertificateStatusJob } from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { db } from "../db";

// ~10 minutes of polling at 30s apart - generous for a slow ACME retry or
// DNS propagation delay, without watching any one domain forever.
const MAX_ATTEMPTS = 20;
const RETRY_DELAY_SECONDS = 30;
const RESOLVER_NAME = "letsencrypt";

function getAcmeFilePath(): string {
  return process.env.TRAEFIK_ACME_FILE ?? "/etc/traefik/acme/acme.json";
}

/**
 * "failed" here means "not issued within our watch window," not a
 * Traefik-confirmed permanent failure - Traefik may keep retrying on its own
 * after we stop watching. The domain's manual recheck action re-arms this
 * from attempt 1, which is the intended way to retry after fixing DNS/etc.
 */
export async function processCheckCertificateStatusJob(job: CheckCertificateStatusJob): Promise<void> {
  const issued = await isDomainCertificateIssued(getAcmeFilePath(), RESOLVER_NAME, job.host);

  if (issued) {
    await db.update(certificates).set({ status: "issued" }).where(eq(certificates.id, job.certificateId));
    return;
  }

  if (job.attempt >= MAX_ATTEMPTS) {
    await db.update(certificates).set({ status: "failed" }).where(eq(certificates.id, job.certificateId));
    return;
  }

  await enqueueJob(
    JOB_CHECK_CERTIFICATE_STATUS,
    { certificateId: job.certificateId, host: job.host, attempt: job.attempt + 1 },
    { startAfterSeconds: RETRY_DELAY_SECONDS },
  );
}
