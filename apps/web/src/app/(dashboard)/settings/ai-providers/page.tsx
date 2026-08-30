import { getAuth } from "@/server/get-auth";
import { AiProvidersPanel } from "./ai-providers-panel";

export default async function AiProvidersPage() {
  const auth = await getAuth();
  if (!auth) return null;

  return (
    <div>
      <h1 className="mb-6 text-xl font-heading font-semibold">AI providers</h1>
      {auth.role === "owner" ? (
        <AiProvidersPanel />
      ) : (
        <p className="text-sm text-muted-foreground">Ask an owner to connect an AI provider.</p>
      )}
    </div>
  );
}
