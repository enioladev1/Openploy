import "server-only";
import { resolveSession, type AuthContext } from "../services/auth-service";
import { getSessionTokenFromCookies } from "../session";

export interface TrpcContext {
  auth: AuthContext | null;
}

export async function createTrpcContext(): Promise<TrpcContext> {
  const token = await getSessionTokenFromCookies();
  const auth = token ? await resolveSession(token) : null;
  return { auth };
}
