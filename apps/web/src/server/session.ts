import "server-only";
import { cookies, headers } from "next/headers";

export const SESSION_COOKIE_NAME = "openploy_session";
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days


export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  const isProd = process.env.NODE_ENV === "production";
  const isHttps = (await headers()).get("x-forwarded-proto") === "https";
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd && isHttps,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getSessionTokenFromCookies(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}
