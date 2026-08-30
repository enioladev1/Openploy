import "server-only";
import { headers } from "next/headers";
import type { RequestMeta } from "./services/auth-service";

export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  };
}
