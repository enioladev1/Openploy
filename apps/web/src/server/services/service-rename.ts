import "server-only";
import { eq } from "drizzle-orm";
import { services } from "@openploy/db";
import type { RenameServiceInput } from "@openploy/shared";
import { db } from "../db";
import { NotFoundError } from "../errors";

// Caller MUST resolve serviceId through getOrgScopedService before calling this.
export async function renameService(input: RenameServiceInput) {
  const [updated] = await db.update(services).set({ name: input.name }).where(eq(services.id, input.serviceId)).returning();
  if (!updated) throw new NotFoundError("Service not found");
  return updated;
}
