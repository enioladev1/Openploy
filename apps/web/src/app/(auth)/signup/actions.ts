"use server";

import { signupInputSchema } from "@openploy/shared";
import { signupInitialAdmin } from "@/server/services/auth-service";
import { checkRateLimit, AUTH_RATE_LIMIT } from "@/server/rate-limit";
import { getRequestMeta } from "@/server/request-meta";

export interface SignupFormState {
  error?: string;
  success?: boolean;
}

export async function signupAction(_prevState: SignupFormState, formData: FormData): Promise<SignupFormState> {
  const meta = await getRequestMeta();
  const rateLimitKey = `signup:${meta.ipAddress ?? "unknown"}`;
  const rateLimit = checkRateLimit(rateLimitKey, AUTH_RATE_LIMIT.limit, AUTH_RATE_LIMIT.windowMs);
  if (!rateLimit.allowed) {
    return { error: "Too many attempts. Please try again later." };
  }

  const parsed = signupInputSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await signupInitialAdmin(parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Signup failed" };
  }

  // No redirect() here - signupInitialAdmin enqueues a Traefik restart (to
  // pick up the ACME email), and Traefik fronts this very page over
  // host-mode ports 80/443, so an immediate navigation can race a real
  // connection gap while it restarts. The client shows an interstitial and
  // navigates itself once that's had time to clear - see signup-form.tsx.
  return { success: true };
}
