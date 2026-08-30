import { getAuth } from "@/server/get-auth";
import { DiskUsagePanel } from "./disk-usage-panel";

export default async function DiskUsagePage() {
  const auth = await getAuth();
  if (!auth) return null;

  return (
    <div>
      <h1 className="mb-6 text-xl font-heading font-semibold">Disk usage</h1>
      {auth.role === "owner" ? (
        <DiskUsagePanel />
      ) : (
        <p className="text-sm text-muted-foreground">Ask an owner to manage disk usage and cleanup.</p>
      )}
    </div>
  );
}
