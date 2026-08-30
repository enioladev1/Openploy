import { getAuth } from "@/server/get-auth";
import { MonitoringPanel } from "./monitoring-panel";

export default async function MonitoringPage() {
  const auth = await getAuth();
  if (!auth) return null;

  return (
    <div>
      <h1 className="mb-6 text-xl font-heading font-semibold">Monitoring</h1>
      {auth.role === "owner" ? (
        <MonitoringPanel />
      ) : (
        <p className="text-sm text-muted-foreground">Ask an owner to view server monitoring.</p>
      )}
    </div>
  );
}
