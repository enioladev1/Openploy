import "server-only";
import { eq } from "drizzle-orm";
import { certificates, platformDomains, platformSettings } from "@openploy/db";
import {
  JOB_CHECK_CERTIFICATE_STATUS,
  JOB_SET_ACME_EMAIL,
  JOB_SYNC_PLATFORM_DOMAIN,
  type SetPlatformDomainInput,
  type UpdateAcmeEmailInput,
} from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { logAuditEvent } from "../audit";
import { db } from "../db";
import { NotFoundError } from "../errors";

export async function getPlatformDomain() {
  const rows = await db
    .select({
      id: platformDomains.id,
      host: platformDomains.host,
      certificateId: platformDomains.certificateId,
      certificateStatus: certificates.status,
    })
    .from(platformDomains)
    .leftJoin(certificates, eq(platformDomains.certificateId, certificates.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAcmeEmail(): Promise<string | null> {
  const row = await db.query.platformSettings.findFirst();
  return row?.acmeEmail ?? null;
}

/** Upserts the one platformSettings row - same singleton pattern as setPlatformDomain, kept in its own table since acmeEmail is set before any dashboard domain necessarily exists (see signupInitialAdmin). */
export async function updateAcmeEmail(organizationId: string, actorUserId: string, input: UpdateAcmeEmailInput) {
  const existing = await db.query.platformSettings.findFirst();

  const row = await db.transaction(async (tx) => {
    let saved;
    if (existing) {
      const [updated] = await tx
        .update(platformSettings)
        .set({ acmeEmail: input.email })
        .where(eq(platformSettings.id, existing.id))
        .returning();
      saved = updated;
    } else {
      const [created] = await tx.insert(platformSettings).values({ acmeEmail: input.email }).returning();
      saved = created;
    }

    await logAuditEvent(tx, {
      organizationId,
      actorUserId,
      action: "platform_settings.update_acme_email",
      targetType: "platform_settings",
      targetId: saved?.id,
      metadata: { previousEmail: existing?.acmeEmail ?? null, email: input.email },
    });

    return saved;
  });
  if (!row) throw new Error("Failed to save the Let's Encrypt email");

  await enqueueJob(JOB_SET_ACME_EMAIL, { email: input.email });

  return row;
}

/** Upserts the one platformDomains row - a domain change (or TLS toggle) always gets a fresh certificate row, same as createDomain never reuses an old one. */
export async function setPlatformDomain(organizationId: string, actorUserId: string, input: SetPlatformDomainInput) {
  const existing = await db.query.platformDomains.findFirst();

  const row = await db.transaction(async (tx) => {
    let certificateId: string | null = null;
    if (input.enableTls) {
      const [cert] = await tx
        .insert(certificates)
        .values({ domain: input.host, provider: "letsencrypt-http01", status: "pending" })
        .returning();
      certificateId = cert?.id ?? null;
    }

    let saved;
    if (existing) {
      const [updated] = await tx
        .update(platformDomains)
        .set({ host: input.host, certificateId })
        .where(eq(platformDomains.id, existing.id))
        .returning();
      saved = updated;
    } else {
      const [created] = await tx.insert(platformDomains).values({ host: input.host, certificateId }).returning();
      saved = created;
    }

    await logAuditEvent(tx, {
      organizationId,
      actorUserId,
      action: existing ? "platform_domain.update" : "platform_domain.set",
      targetType: "platform_domain",
      targetId: saved?.id,
      metadata: { previousHost: existing?.host ?? null, host: input.host, enableTls: input.enableTls },
    });

    return saved;
  });
  if (!row) throw new Error("Failed to save the dashboard domain");

  await enqueueJob(JOB_SYNC_PLATFORM_DOMAIN, {});

  if (row.certificateId) {
    await enqueueJob(
      JOB_CHECK_CERTIFICATE_STATUS,
      { certificateId: row.certificateId, host: row.host, attempt: 1 },
      { startAfterSeconds: 10 },
    );
  }

  return row;
}

export async function removePlatformDomain(organizationId: string, actorUserId: string) {
  const existing = await db.query.platformDomains.findFirst();
  if (!existing) throw new NotFoundError("No dashboard domain is set");

  await db.transaction(async (tx) => {
    await tx.delete(platformDomains).where(eq(platformDomains.id, existing.id));

    await logAuditEvent(tx, {
      organizationId,
      actorUserId,
      action: "platform_domain.remove",
      targetType: "platform_domain",
      targetId: existing.id,
      metadata: { host: existing.host },
    });
  });

  await enqueueJob(JOB_SYNC_PLATFORM_DOMAIN, {});
}

export async function recheckPlatformDomainCertificate() {
  const existing = await db.query.platformDomains.findFirst();
  if (!existing) throw new NotFoundError("No dashboard domain is set");
  if (!existing.certificateId) throw new NotFoundError("This domain has no TLS certificate to check");

  await db.update(certificates).set({ status: "pending" }).where(eq(certificates.id, existing.certificateId));
  await enqueueJob(JOB_CHECK_CERTIFICATE_STATUS, { certificateId: existing.certificateId, host: existing.host, attempt: 1 });
}
