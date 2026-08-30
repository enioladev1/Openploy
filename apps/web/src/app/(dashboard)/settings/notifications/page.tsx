import { getAuth } from "@/server/get-auth";
import { NotificationsPanel } from "./notifications-panel";

export default async function NotificationsPage() {
  const auth = await getAuth();
  if (!auth) return null;

  return (
    <div>
      <h1 className="mb-6 text-xl font-heading font-semibold">Notifications</h1>
      {auth.role === "owner" ? (
        <NotificationsPanel />
      ) : (
        <p className="text-sm text-muted-foreground">Ask an owner to set up notification channels.</p>
      )}
    </div>
  );
}
