import { NextResponse } from "next/server";
import { getAuth } from "@/server/get-auth";
import { issueOauthState } from "@/server/oauth-state";
import { buildInstallUrl } from "@/server/services/github-service";

const INSTALL_STATE_COOKIE = "gh_install_state";

export async function GET(request: Request) {
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const state = await issueOauthState(INSTALL_STATE_COOKIE);
  const installUrl = await buildInstallUrl(state);
  return NextResponse.redirect(installUrl);
}
