import { NextResponse } from "next/server";
import { getEffectiveBaseUrl } from "@/server/base-url";
import { getAuth } from "@/server/get-auth";
import { consumeOauthState } from "@/server/oauth-state";
import { completeGithubAppSetup } from "@/server/services/github-service";

const MANIFEST_STATE_COOKIE = "gh_manifest_state";

export async function GET(request: Request) {
  const baseUrl = await getEffectiveBaseUrl();
  const auth = await getAuth();
  if (!auth || auth.role !== "owner") {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const stateValid = await consumeOauthState(MANIFEST_STATE_COOKIE, state);
  if (!stateValid || !code) {
    return NextResponse.redirect(new URL("/settings/github?error=invalid_state", baseUrl));
  }

  try {
    await completeGithubAppSetup(code);
  } catch (err) {
    const message = err instanceof Error ? err.message : "setup_failed";
    return NextResponse.redirect(new URL(`/settings/github?error=${encodeURIComponent(message)}`, baseUrl));
  }

  // Straight into the install flow rather than back to /settings/github:
  // creating the App only ever happens because the admin wants to connect a
  // repo, so chain the two steps into one continuous redirect instead of
  // making them come back and click "Connect a GitHub account" separately.
  return NextResponse.redirect(new URL("/api/github/install-start", baseUrl));
}
