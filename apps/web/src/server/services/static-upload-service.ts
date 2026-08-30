import "server-only";
import { eq } from "drizzle-orm";
import { applicationServices, staticUploads } from "@openploy/db";
import { db } from "../db";
import { ValidationError } from "../errors";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Caller MUST resolve serviceId through getOrgScopedService before calling
 * this. Stores the zip verbatim (extraction happens agent-side at deploy
 * time, never here) and marks the service as static-sourced - it does NOT
 * deploy on its own; the user deploys explicitly via the Deploy button, same
 * as any other change to a service's config.
 */
export async function uploadStaticBundle(serviceId: string, filename: string, data: Buffer) {
  if (!filename.toLowerCase().endsWith(".zip")) {
    throw new ValidationError("File must be a .zip archive");
  }
  if (data.length === 0) {
    throw new ValidationError("File is empty");
  }
  if (data.length > MAX_UPLOAD_BYTES) {
    throw new ValidationError("File is too large (max 50MB)");
  }
  // Real zip magic-number check ("PK\x03\x04" for a normal archive, "PK\x05\x06"
  // for an empty one) - never trust the client-supplied filename/extension alone.
  const isZip = data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && (data[2] === 0x03 || data[2] === 0x05);
  if (!isZip) {
    throw new ValidationError("File is not a valid zip archive");
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(staticUploads)
      .values({ serviceId, filename, sizeBytes: data.length, zipData: data })
      .onConflictDoUpdate({
        target: staticUploads.serviceId,
        set: { filename, sizeBytes: data.length, zipData: data, uploadedAt: new Date() },
      });

    await tx.update(applicationServices).set({ sourceType: "static" }).where(eq(applicationServices.serviceId, serviceId));
  });
}

/** Caller MUST resolve serviceId through getOrgScopedService before calling this. Metadata only - never loads the blob itself for a UI display query. */
export async function getStaticUploadInfo(serviceId: string) {
  const row = await db.query.staticUploads.findFirst({
    where: eq(staticUploads.serviceId, serviceId),
    columns: { filename: true, sizeBytes: true, uploadedAt: true },
  });
  return row ?? null;
}
