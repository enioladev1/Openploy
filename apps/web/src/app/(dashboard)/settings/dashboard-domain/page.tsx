import { getAuth } from "@/server/get-auth";
import { getPlatformPublicIp } from "@/server/base-url";
import { DashboardDomainPanel } from "./dashboard-domain-panel";

export default async function DashboardDomainPage() {
  const auth = await getAuth();
  if (!auth) return null;

  // Optional hint only - PLATFORM_PUBLIC_IP isn't guaranteed to be set on
  // every install, and the page must still render fine without it.
  let publicIp: string | null = null;
  try {
    publicIp = getPlatformPublicIp();
  } catch {
    publicIp = null;
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-heading font-semibold">Dashboard domain</h1>
      {auth.role === "owner" ? (
        <DashboardDomainPanel publicIp={publicIp} />
      ) : (
        <p className="text-sm text-muted-foreground">Ask an owner to change the dashboard domain.</p>
      )}
    </div>
  );
}
