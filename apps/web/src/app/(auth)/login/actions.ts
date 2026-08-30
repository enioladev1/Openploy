"use server";

import { redirect } from "next/navigation";
import { loginInputSchema } from "@openploy/shared";
import { login } from "@/server/services/auth-service";
import { checkRateLimit, AUTH_RATE_LIMIT } from "@/server/rate-limit";
import { getRequestMeta } from "@/server/request-meta";
import { setSessionCookie } from "@/server/session";

export interface LoginFormState {
  error?: string;
}

export async function loginAction(_prevState: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const meta = await getRequestMeta();
  const emailForKey = String(formData.get("email") ?? "unknown").toLowerCase();
  // Keyed by IP+account, not IP alone - a single attacker IP shouldn't be able
  // to lock every account, and a single targeted account shouldn't be brute-forceable from many IPs either.
  const rateLimitKey = `login:${meta.ipAddress ?? "unknown"}:${emailForKey}`;
  const rateLimit = checkRateLimit(rateLimitKey, AUTH_RATE_LIMIT.limit, AUTH_RATE_LIMIT.windowMs);
  if (!rateLimit.allowed) {
    return { error: "Too many attempts. Please try again later." };
  }

  const parsed = loginInputSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Invalid email or password" };
  }

  let result: Awaited<ReturnType<typeof login>>;
  try {
    result = await login(parsed.data, meta);
  } catch {
    return { error: "Invalid email or password" };
  }

  await setSessionCookie(result.token, result.expiresAt);

  if (result.mfaRequired) {
    redirect("/verify-totp");
  }
  redirect("/dashboard");
}
