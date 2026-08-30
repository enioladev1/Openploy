import { getAuth } from "@/server/get-auth";
import { BackupsPanel } from "./backups-panel";

export default async function BackupsPage() {
  const auth = await getAuth();
  if (!auth) return null;

  return (
    <div>
      <h1 className="mb-6 text-xl font-heading font-semibold">Backups</h1>
      {auth.role === "owner" ? (
        <BackupsPanel />
      ) : (
        <p className="text-sm text-muted-foreground">Ask an owner to connect backup storage.</p>
      )}
    </div>
  );
}
