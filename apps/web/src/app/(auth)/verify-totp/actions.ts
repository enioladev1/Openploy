"use server";

import { redirect } from "next/navigation";
import { totpVerifyInputSchema } from "@openploy/shared";
import { completeMfaChallenge } from "@/server/services/auth-service";
import { checkRateLimit, AUTH_RATE_LIMIT } from "@/server/rate-limit";
import { getRequestMeta } from "@/server/request-meta";
import { getSessionTokenFromCookies } from "@/server/session";

export interface VerifyTotpFormState {
  error?: string;
}

export async function verifyTotpAction(
  _prevState: VerifyTotpFormState,
  formData: FormData,
): Promise<VerifyTotpFormState> {
  const token = await getSessionTokenFromCookies();
  if (!token) redirect("/login");

  const meta = await getRequestMeta();
  const rateLimit = checkRateLimit(
    `totp:${meta.ipAddress ?? "unknown"}`,
    AUTH_RATE_LIMIT.limit,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rateLimit.allowed) {
    return { error: "Too many attempts. Please try again later." };
  }

  const parsed = totpVerifyInputSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) {
    return { error: "Enter the 6-digit code from your authenticator app" };
  }

  try {
    await completeMfaChallenge(token, parsed.data.token);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Verification failed" };
  }

  redirect("/dashboard");
}
