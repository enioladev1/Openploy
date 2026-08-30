import { getAuth } from "@/server/get-auth";
import { ProfilePanel } from "./profile-panel";

export default async function ProfilePage() {
  const auth = await getAuth();
  if (!auth) return null;

  return (
    <div>
      <h1 className="mb-6 text-xl font-heading font-semibold">Profile</h1>
      <ProfilePanel />
    </div>
  );
}
