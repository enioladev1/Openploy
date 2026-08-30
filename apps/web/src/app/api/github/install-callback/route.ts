import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getEffectiveBaseUrl } from "@/server/base-url";
import { getAuth } from "@/server/get-auth";
import { completeInstallation } from "@/server/services/github-service";

const INSTALL_STATE_COOKIE = "gh_install_state";

/**
 * Lenient by design, unlike manifest-callback's strict check: a user can reach
 * this URL either through our own "Connect a GitHub account" button (state
 * cookie present, must match) or by clicking "Configure" directly on GitHub's
 * own installation-settings page (no cookie at all, since that visit never
 * touched our app first). Rejecting the second case would make re-configuring
 * an existing installation's repo access permanently broken. A present-but-wrong
 * cookie still fails - that shape only happens if something is actually forging state.
 */
async function isValidInstallCallback(receivedState: string | null): Promise<boolean> {
  const store = await cookies();
  const expected = store.get(INSTALL_STATE_COOKIE)?.value;
  store.delete(INSTALL_STATE_COOKIE);
  if (!expected) return true;
  return expected === receivedState;
}

export async function GET(request: Request) {
  const baseUrl = await getEffectiveBaseUrl();
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id");
  const state = url.searchParams.get("state");
  const setupAction = url.searchParams.get("setup_action");

  const stateValid = await isValidInstallCallback(state);
  const actionValid = setupAction === "install" || setupAction === "update";
  if (!stateValid || !installationId || !actionValid) {
    return NextResponse.redirect(new URL("/settings/github?error=invalid_state", baseUrl));
  }

  try {
    await completeInstallation(auth.organizationId, auth.userId, installationId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "install_failed";
    return NextResponse.redirect(new URL(`/settings/github?error=${encodeURIComponent(message)}`, baseUrl));
  }

  return NextResponse.redirect(new URL("/settings/github?installed=success", baseUrl));
}
