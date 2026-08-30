import { getAuth } from "@/server/get-auth";
import { AuditLogPanel } from "./audit-log-panel";

export default async function AuditLogPage() {
  const auth = await getAuth();
  if (!auth) return null;

  return (
    <div>
      <h1 className="mb-6 text-xl font-heading font-semibold">Audit log</h1>
      {auth.role === "owner" ? (
        <AuditLogPanel />
      ) : (
        <p className="text-sm text-muted-foreground">Ask an owner to view the audit log.</p>
      )}
    </div>
  );
}
