import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { certificates, domains, getServiceScopedDomain, services } from "@openploy/db";
import {
  JOB_CHECK_CERTIFICATE_STATUS,
  JOB_REMOVE_DOMAIN_CONFIG,
  JOB_SYNC_DOMAINS,
  type CreateDomainInput,
  type GenerateNipIoDomainInput,
} from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { getPlatformPublicIp } from "../base-url";
import { db } from "../db";
import { NotFoundError } from "../errors";
import { buildNipIoHost } from "./nip-io";

// Callers MUST resolve serviceId through getOrgScopedService before calling these.

export async function createDomain(input: CreateDomainInput) {
  const domain = await db.transaction(async (tx) => {
    let certificateId: string | null = null;
    if (input.enableTls) {
      const [cert] = await tx
        .insert(certificates)
        .values({ domain: input.host, provider: "letsencrypt-http01", status: "pending" })
        .returning();
      certificateId = cert?.id ?? null;
    }

    const [row] = await tx
      .insert(domains)
      .values({
        serviceId: input.serviceId,
        host: input.host,
        path: input.path,
        targetPort: input.targetPort,
        certificateId,
        isPrimary: input.isPrimary,
      })
      .returning();

    return row;
  });

  // Applies the new route immediately - without this, Traefik only learns
  // about it on the service's next deploy, which is a confusing dead end for
  // a domain added to an already-running service (404 with no obvious fix).
  await enqueueJob(JOB_SYNC_DOMAINS, { serviceId: input.serviceId });

  if (domain?.certificateId) {
    // Short delay so Traefik has picked up the new route and had a first
    // shot at the ACME challenge before we check - see check-certificate-status.ts.
    await enqueueJob(
      JOB_CHECK_CERTIFICATE_STATUS,
      { certificateId: domain.certificateId, host: domain.host, attempt: 1 },
      { startAfterSeconds: 10 },
    );
  }

  return domain;
}

export async function generateNipIoDomain(input: GenerateNipIoDomainInput) {
  const service = await db.query.services.findFirst({ where: eq(services.id, input.serviceId) });
  if (!service) throw new NotFoundError("Service not found");

  const ip = getPlatformPublicIp();
  const suffix = randomBytes(3).toString("hex");
  const host = buildNipIoHost(service.name, ip, suffix);

  return createDomain({
    serviceId: input.serviceId,
    host,
    path: "/",
    targetPort: input.targetPort,
    enableTls: input.enableTls,
    isPrimary: false,
  });
}

// certificateStatus is null for a domain that never requested TLS - distinct
// from "pending", which means TLS was requested and Traefik hasn't (yet, or
// permanently) gotten a cert for it.
export async function listDomains(serviceId: string) {
  return db
    .select({
      id: domains.id,
      serviceId: domains.serviceId,
      host: domains.host,
      path: domains.path,
      targetPort: domains.targetPort,
      isPrimary: domains.isPrimary,
      certificateId: domains.certificateId,
      certificateStatus: certificates.status,
    })
    .from(domains)
    .leftJoin(certificates, eq(domains.certificateId, certificates.id))
    .where(eq(domains.serviceId, serviceId));
}

export async function deleteDomain(serviceId: string, domainId: string) {
  const domain = await getServiceScopedDomain(db, serviceId, domainId);
  if (!domain) throw new NotFoundError("Domain not found");
  await db.delete(domains).where(eq(domains.id, domainId));
  // Deleting the row alone leaves the route live until the next deploy re-syncs
  // Traefik config, so explicitly enqueue removal of the now-orphaned config file.
  await enqueueJob(JOB_REMOVE_DOMAIN_CONFIG, { domainId });
}

/** Re-arms the check-certificate-status watch from attempt 1 - the way to retry after fixing DNS/etc. past the original watch window. */
export async function recheckCertificate(serviceId: string, domainId: string) {
  const domain = await getServiceScopedDomain(db, serviceId, domainId);
  if (!domain) throw new NotFoundError("Domain not found");
  if (!domain.certificateId) throw new NotFoundError("This domain has no TLS certificate to check");

  await db.update(certificates).set({ status: "pending" }).where(eq(certificates.id, domain.certificateId));
  await enqueueJob(JOB_CHECK_CERTIFICATE_STATUS, { certificateId: domain.certificateId, host: domain.host, attempt: 1 });
}
