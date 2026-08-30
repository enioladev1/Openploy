import { getAuth } from "@/server/get-auth";
import { UsersPanel } from "./users-panel";

export default async function UsersPage() {
  const auth = await getAuth();
  if (!auth) return null;

  return (
    <div>
      <h1 className="mb-6 text-xl font-heading font-semibold">Users</h1>
      {auth.role === "owner" ? (
        <UsersPanel currentUserId={auth.userId} />
      ) : (
        <p className="text-sm text-muted-foreground">Ask an owner to manage users.</p>
      )}
    </div>
  );
}
