import { redirect } from "next/navigation";
import { getAuth } from "@/server/get-auth";
import { isInstanceSetUp } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const auth = await getAuth();
  if (auth) redirect("/dashboard");
  redirect((await isInstanceSetUp()) ? "/login" : "/signup");
}
