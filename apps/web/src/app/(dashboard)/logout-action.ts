"use server";

import { redirect } from "next/navigation";
import { logout } from "@/server/services/auth-service";
import { clearSessionCookie, getSessionTokenFromCookies } from "@/server/session";

export async function logoutAction(): Promise<void> {
  const token = await getSessionTokenFromCookies();
  if (token) await logout(token);
  await clearSessionCookie();
  redirect("/login");
}
