import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const STATE_TTL_SECONDS = 10 * 60;

/** Short-lived, single-use CSRF token for cross-site redirect flows (GitHub App manifest + install). */
export async function issueOauthState(cookieName: string): Promise<string> {
  const state = randomBytes(24).toString("base64url");
  const store = await cookies();
  store.set(cookieName, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });
  return state;
}

export async function consumeOauthState(cookieName: string, receivedState: string | null): Promise<boolean> {
  const store = await cookies();
  const expected = store.get(cookieName)?.value;
  store.delete(cookieName);
  return Boolean(expected) && expected === receivedState;
}
