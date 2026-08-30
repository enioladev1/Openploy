import "server-only";
import { cache } from "react";
import { resolveSession, type AuthContext } from "./services/auth-service";
import { getSessionTokenFromCookies } from "./session";

/** Deduped per request via React's cache() - layout and page both call this without a double DB round-trip. */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const token = await getSessionTokenFromCookies();
  return token ? resolveSession(token) : null;
});
