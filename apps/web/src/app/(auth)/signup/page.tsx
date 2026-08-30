import { redirect } from "next/navigation";
import { isInstanceSetUp } from "@/server/services/auth-service";
import { SignupForm } from "./signup-form";

// Must never be statically prerendered/ISR-cached - without this, Next.js
// bakes the redirect-vs-form decision in at build time (confirmed via a real
// build: it shipped a cached 307 with a 5-minute stale-time), so a fresh
// production image built before any admin exists would keep showing the
// signup form forever instead of reacting to the real, current DB state.
export const dynamic = "force-dynamic";

// Only ever reachable before the first admin account exists - once this
// instance is set up, further access must go through the login page (see
// signupInitialAdmin, which is the actual server-side enforcement this
// redirect is just the UX-level mirror of).
export default async function SignupPage() {
  if (await isInstanceSetUp()) {
    redirect("/login");
  }

  return <SignupForm />;
}
