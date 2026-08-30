import "server-only";
import { eq } from "drizzle-orm";
import { userAvatars } from "@openploy/db";
import { db } from "../db";
import { ValidationError } from "../errors";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

// Real magic-number checks - never trust the client-supplied content-type
// alone, same rationale as static-upload-service.ts's zip signature check.
const SIGNATURES: Array<{ contentType: string; matches: (data: Buffer) => boolean }> = [
  { contentType: "image/png", matches: (d) => d.length >= 8 && d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47 },
  { contentType: "image/jpeg", matches: (d) => d.length >= 3 && d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff },
  {
    contentType: "image/webp",
    matches: (d) => d.length >= 12 && d.subarray(0, 4).toString("ascii") === "RIFF" && d.subarray(8, 12).toString("ascii") === "WEBP",
  },
  {
    contentType: "image/gif",
    matches: (d) => {
      if (d.length < 6) return false;
      const header = d.subarray(0, 6).toString("ascii");
      return header === "GIF87a" || header === "GIF89a";
    },
  },
];

function detectImageType(data: Buffer): string | null {
  return SIGNATURES.find((sig) => sig.matches(data))?.contentType ?? null;
}

/** Callers must only ever pass ctx.auth.userId here - a user can only set their own avatar, never another user's (see profile.ts's router comment on the same IDOR rule for name/email). */
export async function uploadAvatar(userId: string, data: Buffer): Promise<void> {
  if (data.length === 0) throw new ValidationError("File is empty");
  if (data.length > MAX_UPLOAD_BYTES) throw new ValidationError("Image is too large (max 2MB)");

  const contentType = detectImageType(data);
  if (!contentType) throw new ValidationError("File is not a supported image (PNG, JPEG, WEBP, or GIF)");

  await db
    .insert(userAvatars)
    .values({ userId, contentType, sizeBytes: data.length, imageData: data })
    .onConflictDoUpdate({
      target: userAvatars.userId,
      set: { contentType, sizeBytes: data.length, imageData: data, uploadedAt: new Date() },
    });
}

export async function deleteAvatar(userId: string): Promise<void> {
  await db.delete(userAvatars).where(eq(userAvatars.userId, userId));
}

/** Full row, including the image bytes - only for the GET route that actually serves the image, never for a list/display query. */
export async function getAvatar(userId: string): Promise<{ contentType: string; imageData: Buffer } | null> {
  const row = await db.query.userAvatars.findFirst({
    where: eq(userAvatars.userId, userId),
    columns: { contentType: true, imageData: true },
  });
  return row ?? null;
}
